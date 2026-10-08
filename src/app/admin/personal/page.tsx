"use client";
import {useRouter} from 'next/navigation';
import PeopleManager from '@/components/finanzas/operations/PeopleManager';
export default function PersonalPage(){const router=useRouter();return <PeopleManager onClose={()=>router.push('/admin/finanzas')} onChanged={()=>{}}/>;}
