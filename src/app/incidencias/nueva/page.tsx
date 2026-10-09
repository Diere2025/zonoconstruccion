import { TicketForm } from '@/components/support/TicketForm';
export const runtime = 'edge';
export default async function Page({ searchParams }: { searchParams: Promise<{ propia?: string }> }) {
    const params = await searchParams;
    return <TicketForm own={params.propia === '1'} />;
}
