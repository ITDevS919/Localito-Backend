/**
 * Migration script to update categories to the new comprehensive list
 * Run this with: npm run update-categories
 * or: ts-node scripts/update-categories.ts
 */

import { pool } from "../src/db/connection";

const NEW_CATEGORIES = [
  {
    name: 'Food & Drink',
    description: 'Restaurants, bakeries, cafés, takeaways, delis, butchers, greengrocers, specialty grocers, off‑licences'
  },
  {
    name: 'Health & Beauty',
    description: 'Pharmacies, barbers, salons, cosmetics, skincare, health foods'
  },
  {
    name: 'Fashion & Accessories',
    description: 'Clothing, shoes, vintage, jewellery, bags, streetwear'
  },
  {
    name: 'Home & Living',
    description: 'Homeware, furniture, kitchenware, decor, plants, DIY, hardware'
  },
  {
    name: 'Electronics & Tech',
    description: 'Phones, computers, audio, gaming, repairs'
  },
  {
    name: 'Books, Music & Hobbies',
    description: 'Bookshops, records, games/comics, arts & crafts, instruments'
  },
  {
    name: 'Kids & Family',
    description: 'Toys, baby stores, childrenswear, family gift shops'
  },
  {
    name: 'Sports & Outdoors',
    description: 'Sportswear, equipment, bikes, camping/outdoor'
  },
  {
    name: 'Gifts, Flowers & Stationery',
    description: 'Florists, gift shops, cards, stationery, party supplies'
  },
  {
    name: 'Pets',
    description: 'Pet shops, pet food, accessories, groomers'
  },
  {
    name: 'Services',
    description: 'Tailors, cobblers, dry cleaners, printing, key cutting, repairs'
  },
  {
    name: 'Other',
    description: 'Catch‑all if nothing fits; you can review and refine later'
  }
];

async function updateCategories() {
  const client = await pool.connect();
  
  try {
    console.log('Starting category update...');
    
    // First, deactivate old categories that aren't in the new list
    const oldCategoryNames = [
      'Electronics',
      'Clothing',
      'Food & Beverages',
      'Home & Garden',
      'Books',
      'Toys & Games'
    ];
    
    const newCategoryNames = NEW_CATEGORIES.map(c => c.name);
    
    // Deactivate categories that are being replaced
    const categoriesToDeactivate = oldCategoryNames.filter(name => !newCategoryNames.includes(name));
    
    if (categoriesToDeactivate.length > 0) {
      const placeholders = categoriesToDeactivate.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `UPDATE categories SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE name IN (${placeholders})`,
        categoriesToDeactivate
      );
      console.log(`Deactivated ${categoriesToDeactivate.length} old categories:`, categoriesToDeactivate);
    }
    
    // Update existing categories with new descriptions
    for (const category of NEW_CATEGORIES) {
      const result = await client.query(
        `UPDATE categories 
         SET description = $1, is_active = TRUE, updated_at = CURRENT_TIMESTAMP 
         WHERE name = $2`,
        [category.description, category.name]
      );
      
      if (result.rowCount === 0) {
        // Category doesn't exist, insert it
        await client.query(
          `INSERT INTO categories (name, description, is_active) 
           VALUES ($1, $2, TRUE)`,
          [category.name, category.description]
        );
        console.log(`Created new category: ${category.name}`);
      } else {
        console.log(`Updated category: ${category.name}`);
      }
    }
    
    // Handle name changes (map old names to new names)
    const nameMappings: Record<string, string> = {
      'Food & Beverages': 'Food & Drink',
      'Clothing': 'Fashion & Accessories',
      'Home & Garden': 'Home & Living',
      'Electronics': 'Electronics & Tech',
      'Books': 'Books, Music & Hobbies',
      'Toys & Games': 'Kids & Family'
    };
    
    for (const [oldName, newName] of Object.entries(nameMappings)) {
      // Check if old category exists
      const oldCategory = await client.query(
        'SELECT id FROM categories WHERE name = $1',
        [oldName]
      );
      
      if (oldCategory.rows.length > 0) {
        // Check if new category already exists
        const newCategory = await client.query(
          'SELECT id FROM categories WHERE name = $1',
          [newName]
        );
        
        if (newCategory.rows.length > 0) {
          // New category exists, update products to use new category and deactivate old
          await client.query(
            `UPDATE products SET category = $1 WHERE category = $2`,
            [newName, oldName]
          );
          await client.query(
            `UPDATE categories SET is_active = FALSE WHERE name = $1`,
            [oldName]
          );
          console.log(`Mapped products from "${oldName}" to "${newName}" and deactivated old category`);
        } else {
          // Rename the category
          await client.query(
            `UPDATE categories SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2`,
            [newName, oldName]
          );
          // Update products
          await client.query(
            `UPDATE products SET category = $1 WHERE category = $2`,
            [newName, oldName]
          );
          console.log(`Renamed category "${oldName}" to "${newName}"`);
        }
      }
    }
    
    console.log('Category update completed successfully!');
    console.log(`Total categories: ${NEW_CATEGORIES.length}`);
    
  } catch (error) {
    console.error('Error updating categories:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  updateCategories()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed:', error);
      process.exit(1);
    });
}

export { updateCategories };
