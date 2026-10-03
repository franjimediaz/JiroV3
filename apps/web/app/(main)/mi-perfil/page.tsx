import { requireUser } from "@/lib/auth/getCurrentUser";
import ProfileClient from "@/lib/profile/ProfileClient";

export default async function ProfilePage() {
  await requireUser();
  return <ProfileClient />;
}
