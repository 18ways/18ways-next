import ClientHome from '../components/ClientHome';

export default function Home(props: any) {
  return (
    <div id="root" data-testid="root">
      <ClientHome {...props} />
    </div>
  );
}
