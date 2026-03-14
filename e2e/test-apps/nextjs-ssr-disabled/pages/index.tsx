import dynamic from 'next/dynamic';

const ClientHome = dynamic(() => import('../components/ClientHome'), {
  ssr: false,
});

export default function Home(props: any) {
  return (
    <div id="root" data-testid="root" data-e2e-app="nextjs-ssr-disabled">
      <ClientHome {...props} />
    </div>
  );
}
