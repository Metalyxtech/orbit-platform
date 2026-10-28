import { TopBar } from '@orbit/ui';

const Home = async () => (
  <>
    <TopBar crumbs={['Template', 'Home']} />
    <div className="o-page">
      <h1>New portal</h1>
    </div>
  </>
);

export const templateRoutes = { '': Home };
