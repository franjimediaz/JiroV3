"use client";
import Link from "next/link";
import type { listWebPages } from "@/actions/webPages";
export default function WebPagesClient({result}:{result:Awaited<ReturnType<typeof listWebPages>>}) {
 return <section className="p-3"><h1>Páginas web</h1><Link className="btn btn-primary mb-3" href="/system/web-pages/new">Nueva página</Link>
 {!result.ok ? <p role="alert">{result.message}</p> : result.data.length===0 ? <p>No hay páginas. <Link href="/system/web-pages/new">Crear la primera página</Link></p> : <div className="table-responsive"><table className="table"><thead><tr><th>Título</th><th>Ruta</th><th>Última modificación</th><th>Acciones</th></tr></thead><tbody>{result.data.map(page=><tr key={page.id}><td>{page.title}</td><td>{page.path}</td><td>{page.updated_at}</td><td><Link href={"/system/web-editor/"+page.id}>Editar</Link>{" · "}<Link href={"/system/web-pages/"+page.id}>Configuración</Link></td></tr>)}</tbody></table></div>}</section>;
}
