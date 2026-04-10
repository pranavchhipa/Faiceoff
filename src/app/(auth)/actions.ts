"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type AuthResult = { error: string } | void;

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const displayName = formData.get("displayName") as string;
  const role = formData.get("role") as string;
  const phone = (formData.get("phone") as string) || undefined;

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(),
    options: {
      data: {
        display_name: displayName,
        role,
        phone,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(`/auth/verify?email=${encodeURIComponent(email)}`);
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return { error: error.message };
  }

  redirect(`/auth/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyOtp(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;
  const token = formData.get("token") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
