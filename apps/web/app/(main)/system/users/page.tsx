import { createClient } from "@/lib/supabase/server";
import UsersAdminClient from "./UsersAdminClient";

type DbUser = {
  uid: string;
  email: string | null;
  name: string | null;
  role_id: string | null;
};

type DbRole = {
  id: string;
  title: string;
};

export default async function SystemUsersPage() {
  const supabase = await createClient();

  // Cargar usuarios (tabla pública)
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("uid, email, name, role_id")
    .order("email", { ascending: true });

  if (usersError) {
    console.error("Error cargando users:", usersError);
  }

  const users: DbUser[] = usersData ?? [];

  // Cargar roles
  const { data: rolesData, error: rolesError } = await supabase
    .from("rol")
    .select("id, title")
    .order("title", { ascending: true });

  if (rolesError) {
    console.error("Error cargando roles:", rolesError);
  }

  const roles: DbRole[] = rolesData ?? [];

  return <UsersAdminClient users={users} roles={roles} />;
}
