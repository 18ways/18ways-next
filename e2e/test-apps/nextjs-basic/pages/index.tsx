import ClientHome from '../components/ClientHome';

export default function Home(props: any) {
  return (
    <div id="root" data-testid="root" data-e2e-app="nextjs-basic">
      <ClientHome {...props} />
    </div>
  );
}
