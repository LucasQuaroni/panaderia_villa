'use client'

import Image from 'next/image'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-burgundy-dark text-cream/70">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-final.png"
            alt="Panadería Villa"
            width={2048}
            height={2048}
            className="object-contain h-10 w-auto"
          />
          <div>
            <div className="font-sans text-lg font-bold text-cream">
              Panadería Villa
            </div>
            <div className="font-body text-xs text-cream/50">
              Tradición y Excelencia desde 1947
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 font-body text-sm">
          {["Inicio", "Nosotros", "Productos", "Contacto"].map((item) => (
            <button
              key={item}
              onClick={() =>
                document
                  .querySelector(`#${item.toLowerCase()}`)
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="hover:text-gold transition-colors"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center md:items-end gap-1.5 font-body text-xs text-cream/40 text-center md:text-right">
          <div>© {year} Panadería Villa. Todos los derechos reservados.</div>
          <div>
            Developed with ❤️ by{" "}
            <a
              href="https://www.linkedin.com/in/lucasquaroni/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/60 hover:text-gold transition-colors duration-300"
            >
              Lucas Quaroni
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
