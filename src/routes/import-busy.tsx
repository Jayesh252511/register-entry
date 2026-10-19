import { createFileRoute } from '@tanstack/react-router';
import { BusyImport } from '@/components/BusyImport';

export const Route = createFileRoute('/import-busy')({
  head: () => ({ meta: [
    { title: 'Import from BUSY Excel — Transport Register' },
    { name: 'description', content: 'Review and import BUSY sales vouchers with independent register numbering and duplicate protection.' },
    { property: 'og:title', content: 'Import from BUSY Excel — Transport Register' },
    { property: 'og:description', content: 'Private BUSY voucher import with editable preview and import history.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: BusyImport,
});