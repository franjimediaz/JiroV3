export type SidebarItem = {
  id: string;
  nombre: string;
  route?: string;   
  hijos?: SidebarItem[];   
};
