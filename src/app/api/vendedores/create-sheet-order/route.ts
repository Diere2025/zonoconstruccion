import { NextRequest } from 'next/server';
import { getSheetCode, processSheetOrder } from '@/lib/processSheetOrder';

export const runtime = 'edge';
export const GET = getSheetCode;
export async function POST(req: NextRequest) {
  return processSheetOrder(req);
}
