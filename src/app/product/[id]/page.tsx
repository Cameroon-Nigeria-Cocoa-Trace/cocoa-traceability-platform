import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { getProductById } from "@/data/products";
import { ProductDetailClient } from "@/components/ProductDetailClient";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />
      <ProductDetailClient product={product} />
    </div>
  );
}
