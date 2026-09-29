'use client';
import { TicketList } from '@/components/support/TicketList';
import { useSupport } from '@/components/support/SupportShell';
export default function Page() {
    const { me } = useSupport();
    return <TicketList management={me.is_manager}/>;
}
