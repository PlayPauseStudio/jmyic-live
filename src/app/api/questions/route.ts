import { NextResponse } from 'next/server';
import { getDoc } from 'firebase/firestore';
import { questionsDocRef } from '../../../lib/firebase';
import type { QuestionPool } from '../../../lib/types';

export const dynamic = 'force-static';
export const revalidate = false;

export async function GET() {
  try {
    const docSnap = await getDoc(questionsDocRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as QuestionPool;
      return NextResponse.json({
        success: true,
        questions: data.questions || [],
        lastUpdated: data.lastUpdated
      });
    } else {
      return NextResponse.json({
        success: true,
        questions: [],
        lastUpdated: null
      });
    }
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}