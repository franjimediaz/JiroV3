"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = supabaseBrowser();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.replace("/");
  };

  return (
    
    <main className="container d-flex align-items-center justify-content-center min-vh-100">
      <div className="card shadow-sm" style={{ maxWidth: '400px', width: '100%' }}>
        <div className="card-body p-4">
          <form onSubmit={onSubmit} className="form-signin">
            <div className="text-center mb-4">
              <h1>JiRo</h1>
              <div className="mb-4 d-flex justify-content-center">
              </div>
              <h2 className="h5 mb-3 fw-normal">Iniciar Sesión</h2>
            </div>
            
            <div className="form-floating mb-3">
              <input
                type="email"
                placeholder="tu@email.com"
                className="form-control"
                id="floatingEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label htmlFor="floatingEmail">Email</label>
            </div>
            
            <div className="form-floating mb-3">
              <input
                type="password"
                placeholder="••••••••"
                className="form-control"
                id="floatingPassword"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
              />
              <label htmlFor="floatingPassword">Contraseña</label>
            </div>

            <button disabled={loading} type="submit" className="btn btn-lg btn-primary btn-block">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
    
  );
}
