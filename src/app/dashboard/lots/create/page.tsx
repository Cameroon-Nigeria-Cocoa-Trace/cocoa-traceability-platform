
"use client";

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import {
  CocoaApiError,
  createCocoaApiClient,
} from "@/lib/cocoaApiClient";
import type {
  CocoaLot,
  CocoaQualityGrade,
  CloudinaryImageReference,
  Harvest,
  ProductionRecord,
} from "@/types/traceability";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Boxes,
} from "lucide-react";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

function getRemainingHarvestQuantity(harvest: Harvest): number {
  const quantity = Number(harvest.quantityKg);
  const allocated = Number(harvest.allocatedQuantityKg ?? 0);

  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(allocated) ||
    quantity < 0 ||
    allocated < 0
  ) {
    return 0;
  }

  return Math.max(0, quantity - allocated);
}

export default function CreateCocoaLotPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f7f8f3]" />
      }
    >
      <CreateCocoaLotContent />
    </Suspense>
  );
}

function CreateCocoaLotContent() {
  const searchParams = useSearchParams();
  const initialFarmId = searchParams.get("farmId") || "";
  const initialProductionId =
    searchParams.get("productionRecordId") || "";
  const initialHarvestId = searchParams.get("harvestId") || "";

  const { user, farms, loading: authLoading } = useFirebase();

  const apiClient = useMemo(
    () =>
      createCocoaApiClient(async () => {
        if (!user) return null;
        return user.getIdToken();
      }),
    [user]
  );

  const userFarms = useMemo(() => {
    if (!user) return [];
    return farms.filter((farm) => farm.farmerId === user.uid);
  }, [farms, user]);

  const [selectedFarmId, setSelectedFarmId] =
    useState(initialFarmId);
  const [productionRecords, setProductionRecords] =
    useState<ProductionRecord[]>([]);
  const [selectedProductionId, setSelectedProductionId] =
    useState(initialProductionId);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [selectedHarvestId, setSelectedHarvestId] =
    useState(initialHarvestId);

  const [productionLoading, setProductionLoading] =
    useState(false);
  const [harvestLoading, setHarvestLoading] =
    useState(false);

  const [quantityKg, setQuantityKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [currency, setCurrency] = useState("XAF");
  const [qualityGrade, setQualityGrade] =
    useState<CocoaQualityGrade>("Grade 1");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<
    "" | "uploading" | "creating"
  >("");
  const [error, setError] = useState<string | null>(null);
  const [successLotNumber, setSuccessLotNumber] =
    useState<string | null>(null);
  const [harvestRefreshVersion, setHarvestRefreshVersion] =
    useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productionRequestVersion = useRef(0);
  const harvestRequestVersion = useRef(0);
  const userIdRef = useRef<string | null>(user?.uid ?? null);

  // Clear account-specific form and data when the authenticated
  // user changes. Farms must belong to the current Firebase UID.
  useEffect(() => {
    if (userIdRef.current === (user?.uid ?? null)) return;

    userIdRef.current = user?.uid ?? null;

    setSelectedFarmId("");
    setSelectedProductionId("");
    setSelectedHarvestId("");
    setProductionRecords([]);
    setHarvests([]);
    setImageFile(null);
    setQuantityKg("");
    setError(null);
    setSuccessLotNumber(null);
  }, [user?.uid]);

  // Keep the selected farm within the current user's accessible farms.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setSelectedFarmId("");
      setSelectedProductionId("");
      setSelectedHarvestId("");
      setProductionRecords([]);
      setHarvests([]);
      return;
    }

    if (userFarms.length === 0) {
      setSelectedFarmId("");
      setSelectedProductionId("");
      setSelectedHarvestId("");
      setProductionRecords([]);
      setHarvests([]);
      return;
    }

    const selectedFarmIsAccessible = userFarms.some(
      (farm) => farm.id === selectedFarmId
    );

    if (!selectedFarmIsAccessible) {
      const nextFarm =
        userFarms.find((farm) => farm.id === initialFarmId) ??
        userFarms[0];

      setSelectedFarmId(nextFarm.id);
      setSelectedProductionId("");
      setSelectedHarvestId("");
      setProductionRecords([]);
      setHarvests([]);
    }
  }, [
    authLoading,
    user,
    userFarms,
    selectedFarmId,
    initialFarmId,
  ]);

  // Load production records through the authenticated API.
  useEffect(() => {
    const requestId = ++productionRequestVersion.current;

    if (!user || !selectedFarmId) {
      setProductionRecords([]);
      setProductionLoading(false);
      return;
    }

    setProductionRecords([]);
    setSelectedProductionId("");
    setSelectedHarvestId("");
    setHarvests([]);
    setProductionLoading(true);
    setError(null);

    async function loadProductionRecords() {
      try {
        const response = await apiClient.get<{
          success: boolean;
          productionRecords: ProductionRecord[];
        }>("/api/production", {
          params: { farmId: selectedFarmId },
        });

        if (requestId !== productionRequestVersion.current) return;

        const records = Array.isArray(response?.productionRecords)
          ? response.productionRecords
          : [];

        setProductionRecords(records);

        const preferredRecord = records.find(
          (record) =>
            record.productionRecordId === initialProductionId
        );

        setSelectedProductionId(
          preferredRecord?.productionRecordId ??
            records[0]?.productionRecordId ??
            ""
        );
      } catch (err: unknown) {
        if (requestId !== productionRequestVersion.current) return;

        setProductionRecords([]);
        setSelectedProductionId("");
        setError(
          err instanceof CocoaApiError
            ? err.message
            : "Failed to load production records."
        );
      } finally {
        if (requestId === productionRequestVersion.current) {
          setProductionLoading(false);
        }
      }
    }

    void loadProductionRecords();

    return () => {
      productionRequestVersion.current += 1;
    };
  }, [
    selectedFarmId,
    user?.uid,
    apiClient,
    initialProductionId,
  ]);

  // Load harvest records for the selected production season.
  useEffect(() => {
    const requestId = ++harvestRequestVersion.current;

    if (!user || !selectedProductionId) {
      setHarvests([]);
      setHarvestLoading(false);
      return;
    }

    setHarvests([]);
    setSelectedHarvestId("");
    setHarvestLoading(true);
    setError(null);

    async function loadHarvests() {
      try {
        const response = await apiClient.get<{
          success: boolean;
          harvests: Harvest[];
        }>("/api/harvests", {
          params: {
            productionRecordId: selectedProductionId,
          },
        });

        if (requestId !== harvestRequestVersion.current) return;

        const records = Array.isArray(response?.harvests)
          ? response.harvests
          : [];

        setHarvests(records);

        const availableRecords = records.filter(
          (harvest) =>
            harvest.status !== "archived" &&
            getRemainingHarvestQuantity(harvest) > 0
        );

        const preferredHarvest = availableRecords.find(
          (harvest) => harvest.harvestId === initialHarvestId
        );

        setSelectedHarvestId(
          preferredHarvest?.harvestId ??
            availableRecords[0]?.harvestId ??
            ""
        );
      } catch (err: unknown) {
        if (requestId !== harvestRequestVersion.current) return;

        setHarvests([]);
        setSelectedHarvestId("");
        setError(
          err instanceof CocoaApiError
            ? err.message
            : "Failed to load harvest records."
        );
      } finally {
        if (requestId === harvestRequestVersion.current) {
          setHarvestLoading(false);
        }
      }
    }

    void loadHarvests();

    return () => {
      harvestRequestVersion.current += 1;
    };
  }, [
    selectedProductionId,
    user?.uid,
    apiClient,
    initialHarvestId,
    harvestRefreshVersion,
  ]);

  const selectedFarm = userFarms.find(
    (farm) => farm.id === selectedFarmId
  );

  const availableHarvests = harvests.filter(
    (harvest) =>
      harvest.status !== "archived" &&
      getRemainingHarvestQuantity(harvest) > 0
  );

  const selectedHarvest = availableHarvests.find(
    (harvest) => harvest.harvestId === selectedHarvestId
  );

  const remainingHarvestKg = selectedHarvest
    ? getRemainingHarvestQuantity(selectedHarvest)
    : 0;

  const selectedProduction = productionRecords.find(
    (record) =>
      record.productionRecordId === selectedProductionId
  );

  function handleImageSelection(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] ?? null;

    setError(null);
    setImageFile(null);

    if (!file) return;

    if (file.size <= 0) {
      setError("Please select a non-empty image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("The image must not exceed 10 MB.");
      event.target.value = "";
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      setError(
        "Unsupported image format. Choose JPEG, PNG, WebP, or HEIC."
      );
      event.target.value = "";
      return;
    }

    setImageFile(file);
    setSuccessLotNumber(null);
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError(null);
    setSuccessLotNumber(null);

    if (!user) {
      setError("Please sign in before creating a cocoa lot.");
      return;
    }

    if (!selectedFarmId || !selectedProductionId || !selectedHarvestId) {
      setError(
        "Select a farm, production season, and available harvest."
      );
      return;
    }

    if (!selectedHarvest) {
      setError(
        "The selected harvest has no available quantity. Refresh the harvest records."
      );
      return;
    }

    const quantity = Number(quantityKg);
    const price = Number(pricePerKg);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }

    if (quantity > remainingHarvestKg) {
      setError(
        `Only ${remainingHarvestKg.toLocaleString()} kg is available in this harvest.`
      );
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Price per kilogram must be a non-negative number.");
      return;
    }

    if (!imageFile) {
      setError("A cocoa lot image is required.");
      return;
    }

    setSubmitting(true);

    try {
      // Upload the image to Cloudinary through the authenticated API.
      setSubmissionStage("uploading");

      const uploadResponse = await apiClient.uploadFile<{
        success: boolean;
        imageReference: CloudinaryImageReference;
      }>("/api/upload/cocoa-lot", imageFile);

      if (
        !uploadResponse?.success ||
        !uploadResponse.imageReference
      ) {
        throw new Error("The image upload did not return valid metadata.");
      }

      // Submit the lot once. The server transaction is responsible
      // for allocating harvest capacity; never deduct it on the client.
      setSubmissionStage("creating");

      const response = await apiClient.post<{
        success: boolean;
        lot: CocoaLot;
      }>("/api/cocoa-lots", {
        farmId: selectedFarmId,
        productionRecordId: selectedProductionId,
        harvestId: selectedHarvestId,
        quantityKg: quantity,
        pricePerKg: price,
        currency,
        qualityGrade,
        cocoaImage: uploadResponse.imageReference,
      });

      if (!response?.success || !response.lot) {
        throw new Error("The cocoa lot was not created successfully.");
      }

      setSuccessLotNumber(response.lot.lotNumber);
      setQuantityKg("");
      setImageFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Refresh inventory after the server confirms creation.
      setHarvestRefreshVersion((version) => version + 1);
    } catch (err: unknown) {
      setError(
        err instanceof CocoaApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create the cocoa lot."
      );
    } finally {
      setSubmitting(false);
      setSubmissionStage("");
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 pt-32 pb-16">
          <p className="text-sm text-[#57655d]">
            Verifying your account...
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32">
        <DashboardWorkflowNav />

        <Link
          href="/dashboard/lots"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#57655d] hover:text-[#0b3528]"
        >
          <ArrowLeft size={16} />
          Back to Cocoa Lots
        </Link>

        <div className="mb-8">
          <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#2d6130]">
            Production & Inventory
          </span>

          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Create a Cocoa Lot
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#57655d]">
            Allocate harvested cocoa to a traceable lot. The image,
            source harvest, and allocated quantity will be recorded
            through the secure API.
          </p>
        </div>

        {!user ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            Please sign in to create a cocoa lot.
          </div>
        ) : userFarms.length === 0 ? (
          <div className="rounded-3xl border border-[#dfe7d8] bg-white p-8 text-center shadow-sm">
            <Boxes
              size={32}
              className="mx-auto mb-3 text-[#2d6130]"
            />
            <h2 className="text-lg font-bold">
              No accessible farms found
            </h2>
            <p className="mt-2 text-sm text-[#57655d]">
              Register a farm before creating a cocoa lot.
            </p>
            <Link
              href="/dashboard/farms"
              className="mt-5 inline-flex rounded-full bg-[#0b3528] px-5 py-3 text-sm font-bold text-white hover:bg-[#07241b]"
            >
              View Farms
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-3xl border border-[#dfe7d8] bg-white p-5 shadow-sm sm:p-8"
          >
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {successLotNumber && (
              <div
                role="status"
                className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"
              >
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 size={18} />
                  Cocoa lot created successfully
                </div>
                <p className="mt-2">
                  Lot number:{" "}
                  <strong className="font-mono">
                    {successLotNumber}
                  </strong>
                </p>
                <Link
                  href="/dashboard/lots"
                  className="mt-3 inline-block font-bold underline"
                >
                  View Cocoa Lots
                </Link>
              </div>
            )}

            <div>
              <h2 className="text-base font-bold">
                1. Source & Traceability
              </h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Select the farm, season, and harvest that supply
                this lot.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="farm"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Farm Plot
                </label>
                <select
                  id="farm"
                  required
                  value={selectedFarmId}
                  onChange={(event) => {
                    setSelectedFarmId(event.target.value);
                    setSelectedProductionId("");
                    setSelectedHarvestId("");
                    setError(null);
                    setSuccessLotNumber(null);
                  }}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130]"
                >
                  {userFarms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.farmName} — {farm.region}
                    </option>
                  ))}
                </select>

                {selectedFarm && (
                  <p className="mt-1.5 text-xs text-[#57655d]">
                    {selectedFarm.region}
                    {selectedFarm.sizeHectares
                      ? ` · ${selectedFarm.sizeHectares} hectares`
                      : ""}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="production"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Production Season
                </label>
                <select
                  id="production"
                  required
                  value={selectedProductionId}
                  disabled={
                    productionLoading ||
                    productionRecords.length === 0
                  }
                  onChange={(event) => {
                    setSelectedProductionId(event.target.value);
                    setSelectedHarvestId("");
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130] disabled:opacity-60"
                >
                  {productionRecords.length === 0 ? (
                    <option value="">
                      {productionLoading
                        ? "Loading production records..."
                        : "No production records found"}
                    </option>
                  ) : (
                    productionRecords.map((record) => (
                      <option
                        key={record.productionRecordId}
                        value={record.productionRecordId}
                      >
                        {record.productionPeriod} (
                        {record.seasonYear})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="harvest"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Source Harvest
                </label>
                <select
                  id="harvest"
                  required
                  value={selectedHarvestId}
                  disabled={
                    harvestLoading ||
                    availableHarvests.length === 0
                  }
                  onChange={(event) => {
                    setSelectedHarvestId(event.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130] disabled:opacity-60"
                >
                  {availableHarvests.length === 0 ? (
                    <option value="">
                      {harvestLoading
                        ? "Loading harvests..."
                        : "No available harvest quantity"}
                    </option>
                  ) : (
                    availableHarvests.map((harvest) => (
                      <option
                        key={harvest.harvestId}
                        value={harvest.harvestId}
                      >
                        {harvest.harvestDate} ·{" "}
                        {getRemainingHarvestQuantity(
                          harvest
                        ).toLocaleString()}{" "}
                        kg available
                      </option>
                    ))
                  )}
                </select>

                {selectedHarvest && (
                  <p className="mt-1.5 text-xs font-semibold text-[#2d6130]">
                    Remaining unallocated quantity:{" "}
                    {remainingHarvestKg.toLocaleString()} kg
                  </p>
                )}
              </div>

              {selectedProduction && (
                <div className="sm:col-span-2 rounded-xl border border-[#edf1ea] bg-[#fafcf9] p-3 text-xs text-[#57655d]">
                  Production window:{" "}
                  <strong>
                    {selectedProduction.startDate}
                  </strong>{" "}
                  to{" "}
                  <strong>
                    {selectedProduction.endDate || "Ongoing"}
                  </strong>
                </div>
              )}
            </div>

            <div className="border-t border-[#edf1ea] pt-6">
              <h2 className="text-base font-bold">
                2. Lot Details
              </h2>
              <p className="mt-1 text-xs text-[#57655d]">
                Enter how much cocoa to allocate and its reference
                price. Available harvest inventory will be checked
                again by the server.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="quantity"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Quantity (kg)
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={quantityKg}
                  onChange={(event) => {
                    setQuantityKg(event.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 500"
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130]"
                />
                {selectedHarvest && (
                  <p className="mt-1.5 text-xs text-[#57655d]">
                    Maximum at current availability:{" "}
                    {remainingHarvestKg.toLocaleString()} kg
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="price"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Reference Price per kg
                </label>
                <input
                  id="price"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={pricePerKg}
                  onChange={(event) =>
                    setPricePerKg(event.target.value)
                  }
                  placeholder="e.g. 2500"
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130]"
                />
              </div>

              <div>
                <label
                  htmlFor="currency"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Currency
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value)
                  }
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130]"
                >
                  <option value="XAF">XAF — Central African CFA franc</option>
                  <option value="USD">USD — US dollar</option>
                  <option value="NGN">NGN — Nigerian naira</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="grade"
                  className="mb-1.5 block text-xs font-bold text-[#57655d]"
                >
                  Cocoa Quality Grade
                </label>
                <select
                  id="grade"
                  value={qualityGrade}
                  onChange={(event) =>
                    setQualityGrade(
                      event.target.value as CocoaQualityGrade
                    )
                  }
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] p-3 text-sm outline-none focus:border-[#2d6130]"
                >
                  <option value="Grade 1">
                    Grade 1 — Premium
                  </option>
                  <option value="Grade 2">Grade 2</option>
                  <option value="Sub-standard">
                    Sub-standard
                  </option>
                </select>
              </div>
            </div>

            <div className="border-t border-[#edf1ea] pt-6">
              <h2 className="text-base font-bold">
                3. Cocoa Image
              </h2>
              <p className="mt-1 text-xs text-[#57655d]">
                A traceability image is mandatory. It will be
                uploaded to Cloudinary; only its metadata reference
                is stored with the lot.
              </p>

              <label
                htmlFor="cocoaImage"
                className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd8c9] bg-[#fafcf9] px-5 py-8 text-center transition hover:border-[#2d6130]"
              >
                <ImagePlus
                  size={30}
                  className="mb-3 text-[#2d6130]"
                />
                <span className="text-sm font-bold">
                  {imageFile
                    ? imageFile.name
                    : "Choose a cocoa lot image"}
                </span>
                <span className="mt-1 text-xs text-[#57655d]">
                  JPEG, PNG, WebP or HEIC · Maximum 10 MB
                </span>
                <input
                  ref={fileInputRef}
                  id="cocoaImage"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
                  required={!imageFile}
                  onChange={handleImageSelection}
                  className="sr-only"
                />
              </label>

              {imageFile && (
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="mt-2 text-xs font-bold text-red-700 underline"
                >
                  Remove selected image
                </button>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#edf1ea] pt-6 sm:flex-row sm:justify-end">
              <Link
                href="/dashboard/lots"
                className="inline-flex items-center justify-center rounded-xl border border-[#dfe7d8] px-5 py-3 text-sm font-bold text-[#57655d] hover:bg-[#fafcf9]"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={
                  submitting ||
                  productionLoading ||
                  harvestLoading ||
                  !selectedFarmId ||
                  !selectedProductionId ||
                  !selectedHarvestId
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b3528] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#07241b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {submissionStage === "uploading"
                  ? "Uploading image..."
                  : submissionStage === "creating"
                    ? "Creating cocoa lot..."
                    : "Create Cocoa Lot"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
