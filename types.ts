import React from 'react';

export interface Product {
  id: string;
  category: string;
  name: string;
  description: string;
  imageText: string; // Used for the placeholder since we don't have local assets
  bgColor: string; // Decorative background for the product image
}

export interface NavItem {
  label: string;
  href: string;
}

export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  colorClass: string;
}