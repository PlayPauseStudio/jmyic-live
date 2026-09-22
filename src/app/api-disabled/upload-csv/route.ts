import { NextRequest, NextResponse } from 'next/server';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, questionsDocRef } from '@/lib/firebase';
import type { Question, QuestionPool } from '@/lib/types';
import Papa from 'papaparse';

export const dynamic = 'force-static';
export const revalidate = false;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'File must be a CSV' },
        { status: 400 }
      );
    }

    // Read file content
    const fileContent = await file.text();
    
    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase()
    });

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `CSV parsing error: ${parseResult.errors[0].message}` 
        },
        { status: 400 }
      );
    }

    // Validate and transform data
    const questions: Question[] = [];
    const errors: string[] = [];

    parseResult.data.forEach((row: any, index: number) => {
      const rowNum = index + 2; // +2 because index starts at 0 and we skip header
      
      // Validate required fields
      const requiredFields = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'guest_answer'];
      const missingFields = requiredFields.filter(field => !row[field] || row[field].trim() === '');
      
      if (missingFields.length > 0) {
        errors.push(`Row ${rowNum}: Missing fields: ${missingFields.join(', ')}`);
        return;
      }

      // Validate guest answer
      const guestAnswer = row.guest_answer.trim().toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(guestAnswer)) {
        errors.push(`Row ${rowNum}: Guest answer must be A, B, C, or D. Got: ${row.guest_answer}`);
        return;
      }

      // Create question object
      const question: Question = {
        id: `q_${Date.now()}_${index}`,
        question: row.question.trim(),
        option_a: row.option_a.trim(),
        option_b: row.option_b.trim(),
        option_c: row.option_c.trim(),
        option_d: row.option_d.trim(),
        guest_answer: guestAnswer as 'A' | 'B' | 'C' | 'D'
      };

      questions.push(question);
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Validation errors:\n${errors.join('\n')}` 
        },
        { status: 400 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid questions found in CSV' },
        { status: 400 }
      );
    }

    // Update Firestore
    try {
      const docSnap = await getDoc(questionsDocRef);
      let existingQuestions: Question[] = [];

      if (docSnap.exists()) {
        const data = docSnap.data() as QuestionPool;
        existingQuestions = data.questions || [];
      }

      const allQuestions = [...existingQuestions, ...questions];

      await updateDoc(questionsDocRef, {
        questions: allQuestions,
        lastUpdated: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        data: {
          message: `Successfully uploaded ${questions.length} questions`,
          questionsCount: questions.length,
          totalQuestions: allQuestions.length
        }
      });

    } catch (firestoreError) {
      console.error('Firestore error:', firestoreError);
      return NextResponse.json(
        { success: false, error: 'Failed to save questions to database' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}