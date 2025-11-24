import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query, CategoryType } from '@/lib/db';
import type { Category as DBCategory, SubCategory as DBSubCategory } from '@/types/database';

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
