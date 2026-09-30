import { TicketDetail } from '@/components/support/TicketDetail';
export const runtime = 'edge';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <TicketDetail key={id} id={id}/>; }
