import './styles.css';

export const metadata = {
  title: 'DM Keith Price Remover',
  description: 'Create a DM Keith vehicle print PDF with the visible price hidden.',
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
