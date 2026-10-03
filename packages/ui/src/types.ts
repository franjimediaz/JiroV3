export type SidebarItem = {
  id: string;
  nombre: string;
  slug: string;
  route?: string;   
  hijos?: SidebarItem[];   
  icon?: string;
  tipo?: "carpeta" | "tabla" | "subtabla" | "vista";
  orden?: number;
  sidebar?: boolean; 
  permisoKey?: string;  
  canView?:  boolean;
};

export type SidebarModuleSelection = { id: string; pathname: string };
