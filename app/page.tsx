import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/public/Navbar'
import HeroSection from '@/components/public/HeroSection'
import AboutSection from '@/components/public/AboutSection'
import ProductsSection from '@/components/public/ProductsSection'
import ContactSection from '@/components/public/ContactSection'
import Footer from '@/components/public/Footer'
import WhatsAppButton from '@/components/public/WhatsAppButton'

async function getSiteData() {
  const supabase = await createClient()
  const [contentRes, productsRes] = await Promise.all([
    supabase.from('site_content').select('key, value'),
    supabase
      .from('products')
      .select('id, name, description, price, unit, category, image_url, featured')
      .eq('active', true)
      .order('sort_order'),
  ])

  const content: Record<string, string> = {}
  for (const row of contentRes.data ?? []) {
    content[row.key] = row.value
  }

  return { content, products: productsRes.data ?? [] }
}

export default async function Home() {
  const { content, products } = await getSiteData()

  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection
        title={content.hero_title ?? "Hecho con amor, horneado con pasión"}
        subtitle={content.hero_subtitle ?? "Tradición y Excelencia desde 1947"}
      />
      <AboutSection content={content} />
      <ProductsSection products={products} />
      <ContactSection content={content} />
      <Footer />
      <WhatsAppButton />
    </main>
  );
}
