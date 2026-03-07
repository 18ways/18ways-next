import dynamic from 'next/dynamic';

const ClientHome = dynamic(() => import('../components/ClientHome'), {
  ssr: false,
});

export default function Home(props: any) {
  return (
    <div id="root" data-testid="root">
      <ClientHome {...props} />
    </div>
  );
}
