import { saveContactMessage } from '../../../server/services/db.js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    
    if (!body.name || !body.email || !body.message) {
      return NextResponse.json(
        { error: 'Name, email and message are required fields' }, 
        { status: 400 }
      );
    }

    const result = await saveContactMessage(body);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Message sent successfully' 
    });
  } catch (error) {
    console.error('[API/Contact] Error:', error);
    return NextResponse.json(
      { error: 'Failed to save message. Please try again later.' }, 
      { status: 500 }
    );
  }
}
