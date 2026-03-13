import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Messages from "./pages/Messages";
import ContactsPage from "./pages/ContactsPage";
import FunnelsPage from "./pages/FunnelsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TagsPage from "./pages/TagsPage";
import LeadCashBot from "./pages/LeadCashBot";
import Accounts from "./pages/Accounts";
import SettingsPage from "./pages/SettingsPage";

function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/messages" component={Messages} />
        <Route path="/contacts" component={ContactsPage} />
        <Route path="/funnels" component={FunnelsPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/tags" component={TagsPage} />
        <Route path="/bot" component={LeadCashBot} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/settings" component={SettingsPage} />
        {/* Legacy redirects */}
        <Route path="/inbox"><Redirect to="/messages" /></Route>
        <Route path="/dashboard"><Redirect to="/messages" /></Route>
        <Route path="/">
          <Redirect to="/messages" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route component={AppRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
