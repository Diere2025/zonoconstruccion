export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/admin/categories - Fetch taxonomy hierarchy
export async function GET() {
  try {
    const { data: categories, error } = await supabase
      .from("product_categories")
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      // If table doesn't exist yet, return fallback default taxonomy
      return NextResponse.json({
        parents: [
          { id: "p1", name: "Tanques de Agua", parent_id: null },
          { id: "p2", name: "Biodigestores", parent_id: null },
          { id: "p3", name: "Pinturas", parent_id: null },
          { id: "p4", name: "Herramientas", parent_id: null },
          { id: "p5", name: "Termotanques", parent_id: null },
          { id: "p6", name: "Caños Termofusión", parent_id: null },
          { id: "p7", name: "MEPS", parent_id: null },
          { id: "p8", name: "Escaleras", parent_id: null },
          { id: "p9", name: "Insumos", parent_id: null },
          { id: "p99", name: "Otros", parent_id: null }
        ],
        subcategories: [
          { id: "s1", name: "Tanques Tricapa Beige", parent_id: "p1" },
          { id: "s2", name: "Tanques Tricapa Oferta", parent_id: "p1" },
          { id: "s3", name: "Tanques Bicapa", parent_id: "p1" },
          { id: "s4", name: "Tanques Cisterna", parent_id: "p1" },
          { id: "s5", name: "Tanques Cuatricapa", parent_id: "p1" },
          { id: "s6", name: "Complementos para tanques", parent_id: "p1" },
          { id: "s7", name: "Cámaras Sépticas", parent_id: "p2" },
          { id: "s8", name: "Cámaras Desengrasadoras", parent_id: "p2" },
          { id: "s9", name: "Accesorios de pintura", parent_id: "p3" }
        ],
        all: []
      });
    }

    const parents = (categories || []).filter(c => !c.parent_id);
    const subcategories = (categories || []).filter(c => c.parent_id);

    return NextResponse.json({
      parents,
      subcategories,
      all: categories || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/categories - Create parent category or subcategory
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, parent_id, display_order } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");

    const { data, error } = await supabase
      .from("product_categories")
      .insert({
        name: name.trim(),
        slug,
        parent_id: parent_id || null,
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, category: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/admin/categories - Update category
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, parent_id, display_order } = body;

    if (!id) {
      return NextResponse.json({ error: "El ID es requerido" }, { status: 400 });
    }

    const updatePayload: any = {};
    if (name) {
      updatePayload.name = name.trim();
      updatePayload.slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    }
    if (parent_id !== undefined) {
      updatePayload.parent_id = parent_id || null;
    }
    if (display_order !== undefined) {
      updatePayload.display_order = display_order;
    }

    const { data, error } = await supabase
      .from("product_categories")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, category: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/categories - Delete category
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "El ID es requerido" }, { status: 400 });
    }

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
