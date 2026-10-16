import http from '../api/client';

interface LoginResponse {
  ok: boolean;
  token: string;
  user: any;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await http.post('/auth/login', { email, password });
      
      // Guardar token y user en localStorage
      if (response.data.ok && response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user || {}));
        
        // Agregar token a axios para futuras peticiones
        http.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      }
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete http.defaults.headers.common['Authorization'];
    window.location.href = '/login';
  },
  
  getToken() {
    return localStorage.getItem('token');
  },
  
  isAuthenticated() {
    return !!localStorage.getItem('token');
  }
};

// Configurar token al cargar la página
const token = localStorage.getItem('token');
if (token) {
  http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export default authService;
