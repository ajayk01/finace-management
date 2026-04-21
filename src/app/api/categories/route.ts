import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, CategoryType } from '@/lib/db';
import type { Category as DBCategory, SubCategory as DBSubCategory } from '@/types/database';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'expense' or 'income' or 'all'

    let categoryTypeFilter: number[] = [];
    
    if (type === 'expense') {
      categoryTypeFilter = [CategoryType.EXPENSE];
    } else if (type === 'income') {
      categoryTypeFilter = [CategoryType.INCOME];
    } else {
      // Return all types
      categoryTypeFilter = [CategoryType.EXPENSE, CategoryType.INCOME];
    }

    // Fetch categories
    const categoriesSql = `
      SELECT ID, CATEGORY_NAME, BUDGET, CATEGORY_TYPE
      FROM Category`;
    
    const categories = await query<DBCategory>(categoriesSql, []);

    // Fetch subcategories for these categories
    const subCategoriesSql = `
      SELECT sc.ID, sc.CATEGORY_ID, sc.SUB_CATEGORY_NAME, sc.BUDGET
      FROM SubCategory sc
      JOIN Category c ON sc.CATEGORY_ID = c.ID
      WHERE c.CATEGORY_TYPE IN (${categoryTypeFilter.join(',')})
      ORDER BY sc.SUB_CATEGORY_NAME
    `;
    
    const subCategories = await query<DBSubCategory>(subCategoriesSql, []);

    const formattedCategories = categories.map((cat: DBCategory) => ({
      id: cat.ID.toString(),
      name: cat.CATEGORY_NAME,
      budget: cat.BUDGET,
      type: cat.CATEGORY_TYPE === CategoryType.EXPENSE ? 'Expense' : 'Income'
    }));

    const formattedSubCategories = subCategories.map((sub: DBSubCategory) => ({
      id: sub.ID.toString(),
      categoryId: sub.CATEGORY_ID.toString(),
      name: sub.SUB_CATEGORY_NAME,
      budget: sub.BUDGET
    }));

    return NextResponse.json({
      categories: formattedCategories,
      subCategories: formattedSubCategories
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching categories.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

const addCategorySchema = z.object({
  categoryName: z.string().min(1, 'Category name is required.'),
  categoryType: z.enum(['expense', 'income'], { required_error: 'Category type is required.' }),
  budget: z.coerce.number().min(0, 'Budget must be non-negative.').default(0),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = addCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { categoryName, categoryType, budget } = parsed.data;
    const typeValue = categoryType === 'expense' ? CategoryType.EXPENSE : CategoryType.INCOME;

    // Check if a category with the same name and type already exists
    const existing = await query(
      'SELECT ID FROM Category WHERE CATEGORY_NAME = ? AND CATEGORY_TYPE = ?',
      [categoryName, typeValue]
    );

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A ${categoryType} category with the name "${categoryName}" already exists.` },
        { status: 409 }
      );
    }

    const result = await query(
      'INSERT INTO Category (CATEGORY_NAME, BUDGET, CATEGORY_TYPE) VALUES (?, ?, ?)',
      [categoryName, budget, typeValue]
    );

    const newId = result.insertId;

    return NextResponse.json({
      id: newId.toString(),
      name: categoryName,
      budget,
      type: categoryType === 'expense' ? 'Expense' : 'Income',
    }, { status: 201 });

  } catch (error) {
    console.error('Error adding category:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while adding category.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
