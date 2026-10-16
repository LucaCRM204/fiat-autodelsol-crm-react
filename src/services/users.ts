import { api } from "../api";

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  reportsTo: number | null;
  active: number | boolean;
};

export const listUsers = async (): Promise<User[]> => {
  const response = await api.get("/users");
  return response.data.users || response.data || [];
};

export const createUser = async (p: Partial<User> & { password?: string }) => {
  const response = await api.post("/users", p);
  return response.data.user || response.data;
};

export const deleteUser = async (id: number) =>
  (await api.delete(`/users/${id}`)).data;

export const updateUser = async (id: number, p: Partial<User> & { password?: string }) => {
  const response = await api.put(`/users/${id}`, p);
  return response.data.user || response.data;
};
