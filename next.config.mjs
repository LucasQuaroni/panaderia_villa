/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Activado: el proyecto compila sin errores de tipos. Si en el futuro
    // aparece un error de TypeScript, el build fallará (mejor detectarlo acá
    // que en producción).
    ignoreBuildErrors: false,
  },
  images: {
    // NOTA: mantener 'unoptimized: true' mientras existan imágenes viejas en base64.
    // Una vez que todas las fotos estén migradas a Supabase Storage, se puede
    // poner en false para activar la optimización de Next.js (mejora la velocidad/SEO).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hebbkx1anhila5yf.public.blob.vercel-storage.com',
      },
      {
        // Imágenes de producto servidas desde Supabase Storage.
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
