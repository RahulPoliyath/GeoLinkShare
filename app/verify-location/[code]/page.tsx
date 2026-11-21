import type { Metadata } from 'next';
import { getLinkByShortCode } from '@/lib/db';
import { resolveLinkSocialPreview } from '@/lib/link-preview';
import VerifyLocationClient from './VerifyLocationClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const cleanCode = (code || '').trim();
  const link = /^[a-zA-Z0-9_-]{3,32}$/.test(cleanCode)
    ? await getLinkByShortCode(cleanCode).catch(() => null)
    : null;
  const preview = await resolveLinkSocialPreview(link);

  return {
    title: preview.title,
    description: preview.description,
    openGraph: {
      title: preview.title,
      description: preview.description,
      siteName: preview.siteName,
      type: 'website',
      ...(preview.imageUrl ? { images: [{ url: preview.imageUrl }] } : {}),
    },
    twitter: {
      card: preview.imageUrl ? 'summary_large_image' : 'summary',
      title: preview.title,
      description: preview.description,
      ...(preview.imageUrl ? { images: [preview.imageUrl] } : {}),
    },
  };
}

export default async function VerifyLocationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <VerifyLocationClient code={code} />;
}
