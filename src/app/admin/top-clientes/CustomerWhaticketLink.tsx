import { ExternalLink, MessageCircle } from 'lucide-react';

export default function CustomerWhaticketLink({ href }: { href: string | null | undefined }) {
  if (!href || !/^https:\/\/app\.whaticket\.com\/tickets\/\S+$/i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">
    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir en Whaticket
    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
  </a>;
}
