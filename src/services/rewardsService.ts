import { pool } from '../db/connection';

const CASHBACK_RATE = 0.01; // 1% cashback

export class RewardsService {
  /**
   * Calculate and award cashback points
   */
  async awardCashback(userId: string, orderId: string, orderTotal: number) {
    try {
      const cashbackAmount = orderTotal * CASHBACK_RATE;

      // Get or create user points record
      let pointsResult = await pool.query(
        'SELECT * FROM user_points WHERE user_id = $1',
        [userId]
      );

      if (pointsResult.rows.length === 0) {
        await pool.query(
          `INSERT INTO user_points (user_id, balance, total_earned)
           VALUES ($1, $2, $2)`,
          [userId, cashbackAmount]
        );
      } else {
        await pool.query(
          `UPDATE user_points 
           SET balance = balance + $1,
               total_earned = total_earned + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2`,
          [cashbackAmount, userId]
        );
      }

      // Record transaction
      await pool.query(
        `INSERT INTO points_transactions (user_id, order_id, transaction_type, amount, description)
         VALUES ($1, $2, 'earned', $3, $4)`,
        [userId, orderId, cashbackAmount, `1% cashback on order ${orderId}`]
      );

      // Update order with points earned
      await pool.query(
        'UPDATE orders SET points_earned = $1 WHERE id = $2',
        [cashbackAmount, orderId]
      );

      return cashbackAmount;
    } catch (error: any) {
      console.error('[Rewards] Failed to award cashback:', error);
      throw error;
    }
  }

  /**
   * Redeem points for order
   */
  async redeemPoints(userId: string, orderId: string, pointsToRedeem: number) {
    try {
      // Atomic points deduction with balance check
      // Only deduct if sufficient balance exists
      const deductResult = await pool.query(
        `UPDATE user_points 
         SET balance = balance - $1,
             total_redeemed = total_redeemed + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND balance >= $1
         RETURNING balance`,
        [pointsToRedeem, userId]
      );

      if (deductResult.rowCount === 0) {
        // Either user not found or insufficient balance
        const checkResult = await pool.query(
          'SELECT balance FROM user_points WHERE user_id = $1',
          [userId]
        );
        
        if (checkResult.rows.length === 0) {
          throw new Error('User points record not found');
        } else {
          throw new Error(`Insufficient points balance. Available: ${checkResult.rows[0].balance}, Requested: ${pointsToRedeem}`);
        }
      }

      console.log(`[Rewards] Deducted ${pointsToRedeem} points for user ${userId}. New balance: ${deductResult.rows[0].balance}`);

      // Record transaction
      await pool.query(
        `INSERT INTO points_transactions (user_id, order_id, transaction_type, amount, description)
         VALUES ($1, $2, 'redeemed', $3, $4)`,
        [userId, orderId, pointsToRedeem, `Points redeemed for order ${orderId}`]
      );

      // Update order
      await pool.query(
        'UPDATE orders SET points_used = $1 WHERE id = $2',
        [pointsToRedeem, orderId]
      );

      return pointsToRedeem;
    } catch (error: any) {
      console.error('[Rewards] Failed to redeem points:', error);
      throw error;
    }
  }

  /**
   * Get user points balance
   */
  async getUserPoints(userId: string) {
    try {
      const result = await pool.query(
        'SELECT * FROM user_points WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          balance: 0,
          totalEarned: 0,
          totalRedeemed: 0,
        };
      }

      return {
        balance: parseFloat(result.rows[0].balance) || 0,
        totalEarned: parseFloat(result.rows[0].total_earned) || 0,
        totalRedeemed: parseFloat(result.rows[0].total_redeemed) || 0,
      };
    } catch (error: any) {
      console.error('[Rewards] Failed to get user points:', error);
      throw error;
    }
  }

  /**
   * Get user points transactions
   */
  async getUserPointsTransactions(userId: string) {
    try {
      const result = await pool.query(
        `SELECT id, user_id, order_id, transaction_type, amount, description, created_at
         FROM points_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        order_id: row.order_id,
        transaction_type: row.transaction_type,
        type: row.transaction_type, // Alias for customer-app compatibility
        amount: parseFloat(row.amount) || 0,
        description: row.description,
        created_at: row.created_at,
      }));
    } catch (error: any) {
      console.error('[Rewards] Failed to get user points transactions:', error);
      throw error;
    }
  }

  /**
   * Get participating business IDs for a discount code. Returns null if site-wide (no rows in discount_code_businesses).
   */
  async getParticipatingBusinessIds(code: string): Promise<string[] | null> {
    const codeResult = await pool.query(
      'SELECT id FROM discount_codes WHERE code = $1',
      [code.toUpperCase()]
    );
    if (codeResult.rows.length === 0) return null;
    const discountCodeId = codeResult.rows[0].id;
    const bizResult = await pool.query(
      'SELECT business_id FROM discount_code_businesses WHERE discount_code_id = $1',
      [discountCodeId]
    );
    if (bizResult.rows.length === 0) return null; // site-wide (backward compat: no rows = all businesses)
    return bizResult.rows.map((r: { business_id: string }) => r.business_id);
  }

  /**
   * Whether this discount code applies to the given business. Site-wide codes (no participating rows) apply to all.
   */
  async codeAppliesToBusiness(code: string, businessId: string): Promise<boolean> {
    const participating = await this.getParticipatingBusinessIds(code);
    if (participating === null) return true; // site-wide
    return participating.includes(businessId);
  }

  /**
   * Validate discount code. If businessIds is provided, code is valid only if it applies to at least one of those businesses.
   */
  async validateDiscountCode(code: string, orderTotal: number, businessIds?: string[]) {
    try {
      const result = await pool.query(
        `SELECT * FROM discount_codes 
         WHERE code = $1 
           AND is_active = true 
           AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
           AND (usage_limit IS NULL OR used_count < usage_limit)`,
        [code.toUpperCase()]
      );

      if (result.rows.length === 0) {
        return { valid: false, message: 'Invalid or expired discount code' };
      }

      const discount = result.rows[0];

      // If businessIds provided, code must apply to at least one of them
      if (businessIds && businessIds.length > 0) {
        const participating = await this.getParticipatingBusinessIds(code);
        if (participating !== null) {
          const applies = businessIds.some((id) => participating.includes(id));
          if (!applies) {
            return {
              valid: false,
              message: 'This discount code is not valid for any business in your cart',
            };
          }
        }
      }

      // Check minimum purchase amount
      if (orderTotal < parseFloat(discount.min_purchase_amount || 0)) {
        return {
          valid: false,
          message: `Minimum purchase of £${discount.min_purchase_amount} required`,
        };
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (discount.discount_type === 'percentage') {
        discountAmount = orderTotal * (parseFloat(discount.discount_value) / 100);
        if (discount.max_discount_amount) {
          discountAmount = Math.min(discountAmount, parseFloat(discount.max_discount_amount));
        }
      } else {
        discountAmount = parseFloat(discount.discount_value);
      }

      let participatingBusinessIds: string[] | null = await this.getParticipatingBusinessIds(code);

      return {
        valid: true,
        discount: {
          id: discount.id,
          code: discount.code,
          amount: discountAmount,
          type: discount.discount_type,
        },
        participatingBusinessIds,
      };
    } catch (error: any) {
      console.error('[Rewards] Failed to validate discount code:', error);
      throw error;
    }
  }

  /**
   * Apply discount code to order. Fails if the code does not apply to the order's business.
   */
  async applyDiscountCode(orderId: string, code: string) {
    try {
      const orderResult = await pool.query('SELECT total, business_id FROM orders WHERE id = $1', [orderId]);
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const orderTotal = parseFloat(orderResult.rows[0].total);
      const businessId = orderResult.rows[0].business_id;

      const applies = await this.codeAppliesToBusiness(code, businessId);
      if (!applies) {
        throw new Error('This discount code is not valid for this order');
      }

      const validation = await this.validateDiscountCode(code, orderTotal, [businessId]);

      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const discount = validation.discount!;

      // Update order
      await pool.query(
        `UPDATE orders 
         SET discount_amount = $1,
             total = total - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [discount.amount, orderId]
      );

      // Record usage
      await pool.query(
        `INSERT INTO order_discount_codes (order_id, discount_code_id, discount_amount)
         VALUES ($1, $2, $3)`,
        [orderId, discount.id, discount.amount]
      );

      // Increment usage count
      await pool.query(
        `UPDATE discount_codes 
         SET used_count = used_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [discount.id]
      );

      return discount;
    } catch (error: any) {
      console.error('[Rewards] Failed to apply discount code:', error);
      throw error;
    }
  }
}

export const rewardsService = new RewardsService();
