"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function createCustomer(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!name) return { ok: false, error: "El nombre es obligatorio" };

  const { error, data } = await supabase
    .from("customers")
    .insert({ name, email, phone })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(id: string, formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!name) return { ok: false, error: "El nombre es obligatorio" };

  const { error } = await supabase
    .from("customers")
    .update({ name, email, phone })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomer(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/customers");
  redirect("/customers");
}

// Server action wrapper usable directly as a form action from client components
export async function upsertCustomerAction(formData: FormData): Promise<Result> {
  const idRaw = String(formData.get("id") || "");
  const id = idRaw === "" ? null : idRaw;

  if (!id) {
    // create
    return await createCustomer(formData);
  }

  // update
  const res = await updateCustomer(id, formData);
  if (!res.ok) return res;
  // redirect back to view
  redirect(`/customers/${id}`);
}

export async function deleteCustomerAction(formData: FormData): Promise<Result> {
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "id requerido" };
  return await deleteCustomer(id);
}
