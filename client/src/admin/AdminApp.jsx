import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./hooks/useAuth";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminNotFoundPage } from "./pages/AdminNotFoundPage";
import { CostingPage } from "./pages/CostingPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PendingOrdersPage } from "./pages/PendingOrdersPage";
import { PurchasingPage } from "./pages/PurchasingPage";
import { SalesPage } from "./pages/SalesPage";
import { StaticPage } from "./pages/StaticPage";
import { VouchersPage } from "./pages/VouchersPage";

export default function AdminApp() {
  return (
    <AuthProvider>
      <meta name="robots" content="noindex, nofollow" />
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="inventory" replace />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/:id" element={<ProductFormPage key="edit" />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="purchasing" element={<PurchasingPage />} />
          <Route path="costing" element={<CostingPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="orders/pending" element={<PendingOrdersPage />} />
          <Route path="vouchers" element={<VouchersPage />} />
          <Route path="static" element={<StaticPage />} />
          <Route path="*" element={<AdminNotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
