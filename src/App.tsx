import { AppLayout } from "./layouts/AppLayout";
import { WorldMap } from "./components/world-map/WorldMap";

export default function App() {
  return (
    <AppLayout>
      <WorldMap />
    </AppLayout>
  );
}
