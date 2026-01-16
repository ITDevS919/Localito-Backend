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
      // Check user balance
      const pointsResult = await pool.query(
        'SELECT balance FROM user_points WHERE user_id = $1',
        [userId]
      );

      if (pointsResult.rows.length === 0 || pointsResult.rows[0].balance < pointsToRedeem) {
        throw new Error('Insufficient points balance');
      }

      // Deduct points
      await pool.query(
        `UPDATE user_points 
         SET balance = balance - $1,
             total_redeemed = total_redeemed + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [pointsToRedeem, userId]
      );

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
   * Validate discount code
   */
  async validateDiscountCode(code: string, orderTotal: number) {
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

      return {
        valid: true,
        discount: {
          id: discount.id,
          code: discount.code,
          amount: discountAmount,
          type: discount.discount_type,
        },
      };
    } catch (error: any) {
      console.error('[Rewards] Failed to validate discount code:', error);
      throw error;
    }
  }

  /**
   * Apply discount code to order
   */
  async applyDiscountCode(orderId: string, code: string) {
    try {
      const orderResult = await pool.query('SELECT total FROM orders WHERE id = $1', [orderId]);
      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const orderTotal = parseFloat(orderResult.rows[0].total);
      const validation = await this.validateDiscountCode(code, orderTotal);

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
