import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const upserts = [
    { key: "contact_address", value: "Independencia 154, Corral de Bustos" },
    { key: "contact_phone", value: "3468-580183" },
    {
      key: "contact_hours",
      value:
        "Lunes a viernes de 7:30 a 12:30 y de 17 a 20. Sábados de 8:30 a 12:30.",
    },
    { key: "map_lat", value: "-33.283625" },
    { key: "map_lng", value: "-62.1839518" },
    { key: "hero_subtitle", value: "Tradición y Excelencia desde 1947" },
  ];
  
  const { data, error } = await supabase.from('site_content').upsert(upserts, { onConflict: 'key' });
  console.log(error || "Success");
}
main();
