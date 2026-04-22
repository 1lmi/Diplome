import type { AuthResponse, CourierBoard, Order, User } from './types';
import { request } from './client';

export const courierApi = {
  login(login: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
  },

  me() {
    return request<User>('/auth/me');
  },

  logout() {
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  },

  getBoard() {
    return request<CourierBoard>('/courier/orders');
  },

  getOrder(orderId: number) {
    return request<Order>(`/courier/orders/${orderId}`);
  },

  claimOrder(orderId: number) {
    return request<Order>(`/courier/orders/${orderId}/claim`, { method: 'POST' });
  },

  startDelivery(orderId: number) {
    return request<Order>(`/courier/orders/${orderId}/start-delivery`, { method: 'POST' });
  },

  completeDelivery(orderId: number) {
    return request<Order>(`/courier/orders/${orderId}/complete`, { method: 'POST' });
  },
};
