export type SidebarItem = {
  id: string;
  nombre: string;
  slug: string;
  route?: string;   
  hijos?: SidebarItem[];   
  icon?: string;
  tipo?: "carpeta" | "tabla" | "subtabla"; 
  sidebar?: boolean; 
  permisoKey?: string;  
  canView?:  boolean;
};
