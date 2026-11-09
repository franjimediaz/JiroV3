import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
export async function requireWebAdmin() { const context=await getCurrentUser(); if(!context) redirect("/login"); if(context.role?.slug!=="systemadmin") redirect("/403"); }
