import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Inbox from "./pages/Inbox";
import Accounts from "./pages/Accounts";
import Analytics from "./pages/Analytics";
import QuickReplies from "./pages/QuickReplies";
import AutoReplies from "./pages/AutoReplies";
import Settings from "./pages/Settings";
import DialogDetail from "./pages/DialogDetail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/inbox/:id" component={DialogDetail} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/quick-replies" component={QuickReplies} />
      <Route path="/auto-replies" component={AutoReplies} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
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
