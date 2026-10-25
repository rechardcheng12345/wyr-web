import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { AboutPage } from "@/pages/AboutPage";
import { CartPage } from "@/pages/CartPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { CheckoutReturnPage } from "@/pages/CheckoutReturnPage";
import { ContactPage } from "@/pages/ContactPage";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OrderPage } from "@/pages/OrderPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { ProductsPage } from "@/pages/ProductsPage";

const AdminApp = lazy(() => import("@/admin/AdminApp"));

export function App() {
  return (
    // Outer boundary for crashes in the layout itself; pages have their own inside <Layout>.
    <ErrorBoundary>
      <Routes>
        <Route
          path="system/*"
          element={
            <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:slug" element={<ProductDetailPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="checkout/return" element={<CheckoutReturnPage />} />
          <Route path="orders/:orderNo" element={<OrderPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
