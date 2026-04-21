import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { z } from 'zod';

const addSubCategorySchema = z.object({
  categoryId: z.coerce.number().min(1, 'Category is required.'),
  subCategoryName: z.string().min(1, 'Sub-category name is required.'),
  budget: z.coerce.number().min(0, 'Budget must be non-negative.').default(0),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = addSubCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { categoryId, subCategoryName, budget } = parsed.data;

    // Verify the category exists
    const category = await query(
      'SELECT ID, CATEGORY_NAME FROM Category WHERE ID = ?',
      [categoryId]
    );

    if (!category || category.length === 0) {
      return NextResponse.json(
        { error: 'The specified category does not exist.' },
        { status: 404 }
      );
    }

    // Check if a subcategory with the same name already exists under this category
    const existing = await query(
      'SELECT ID FROM SubCategory WHERE CATEGORY_ID = ? AND SUB_CATEGORY_NAME = ?',
      [categoryId, subCategoryName]
    );

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: `A sub-category with the name "${subCategoryName}" already exists under "${category[0].CATEGORY_NAME}".` },
        { status: 409 }
      );
    }

    const result = await query(
      'INSERT INTO SubCategory (CATEGORY_ID, SUB_CATEGORY_NAME, BUDGET) VALUES (?, ?, ?)',
      [categoryId, subCategoryName, budget]
    );

    const newId = result.insertId;

    return NextResponse.json({
      id: newId.toString(),
      categoryId: categoryId.toString(),
      name: subCategoryName,
      budget,
    }, { status: 201 });

  } catch (error) {
    console.error('Error adding sub-category:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while adding sub-category.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
