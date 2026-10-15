/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { DashboardWorkflowNav } from "@/components/DashboardWorkflowNav";
import { useFirebase } from "@/context/FirebaseContext";
import { createCocoaApiClient, CocoaApiError } from "@/lib/cocoaApiClient";
import {
  TraceCertificate,
  CertificateApplication,
  CocoaLot,
} from "@/types/traceability";
import { PublicCertificateLineage } from "@/services/certificateService";
import {
  BadgeCheck,
  Plus,
  ShieldCheck,
  Building2,
  Boxes,
  FileCheck2,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  X,
  Eye,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";

export default function OriginCertificatesPage() {
  const { user, farms, loading: authLoading } = useFirebase();

  const apiClient = useMemo(() => {
    return createCocoaApiClient(async () => {
      if (!user) return null;
      return await user.getIdToken();
    });
  }, [user]);

  // Tab State: "certificates" | "applications"
  const [activeTab, setActiveTab] = useState<"certificates" | "applications">("certificates");

  // Certificates & Applications State
  const [certificates, setCertificates] = useState<TraceCertificate[]>([]);
  const [applications, setApplications] = useState<CertificateApplication[]>([]);
  const [lots, setLots] = useState<CocoaLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Inspector State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedCertificateId, setSelectedCertificateId] = useState<string | null>(null);
  const [lineageData, setLineageData] = useState<PublicCertificateLineage | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);

  // Application Form State
  const [formLotId, setFormLotId] = useState("");
  const [formApplicantType, setFormApplicantType] = useState<string>("farmer");
  const [submittingApp, setSubmittingApp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const selectedFormLot = lots.find((l) => l.lotId === formLotId);

  // Authority quick-issue modal state (if applicable)
  const [issuingAppId, setIssuingAppId] = useState<string | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");

  // Load Cocoa Lots (for application form & cross-referencing)
  const loadLots = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.get<{ success: boolean; lots: CocoaLot[] }>("/api/cocoa-lots");
      if (res && res.lots) {
        setLots(res.lots);
      }
    } catch {
      // Continue even if lots fail
    }
  }, [user, apiClient]);

  // Load Certificates
  const loadCertificates = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        certificates: TraceCertificate[];
      }>("/api/certificates", {
        params: { holderId: user.uid },
      });
      if (res && res.certificates) {
        setCertificates(res.certificates);
      } else {
        setCertificates([]);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setError(err.message);
      } else {
        setError("Failed to load certificates.");
      }
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  }, [user, apiClient]);

  // Load Applications
  const loadApplications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiClient.get<{
        success: boolean;
        applications: CertificateApplication[];
      }>("/api/certificate-applications", {
        params: { applicantId: user.uid },
      });
      if (res && res.applications) {
        setApplications(res.applications);
      } else {
        setApplications([]);
      }
    } catch {
      // Ignore background applications load failure
    }
  }, [user, apiClient]);

  // Fetch on mount or user change
  useEffect(() => {
    if (user) {
      loadCertificates();
      loadApplications();
      loadLots();
    }
  }, [user, loadCertificates, loadApplications, loadLots]);

  // View Certificate Lineage
  const handleViewLineage = async (certId: string) => {
    setSelectedCertificateId(certId);
    setLineageLoading(true);
    setLineageError(null);
    setLineageData(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        lineage: PublicCertificateLineage;
      }>(`/api/certificates/${certId}`, {
        params: { includeLineage: true },
      });
      if (res && res.lineage) {
        setLineageData(res.lineage);
      } else {
        setLineageError("Provenance lineage details not available.");
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setLineageError(err.message);
      } else {
        setLineageError("Failed to resolve certificate lineage.");
      }
    } finally {
      setLineageLoading(false);
    }
  };

  // Submit Certificate Application
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLotId) {
      setFormError("Please select a backing Cocoa Lot.");
      return;
    }

    const targetLot = lots.find((l) => l.lotId === formLotId);
    if (!targetLot) {
      setFormError("Selected Cocoa Lot was not found.");
      return;
    }

    const totalLotKg = targetLot.quantityKg;
    if (typeof totalLotKg !== "number" || isNaN(totalLotKg) || totalLotKg <= 0) {
      setFormError("The selected Cocoa Lot does not have a valid recorded weight.");
      return;
    }

    setSubmittingApp(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload = {
        lotId: formLotId,
        requestedQuantityKg: totalLotKg,
        applicantType: formApplicantType,
      };

      const res = await apiClient.post<{
        success: boolean;
        application: CertificateApplication;
      }>("/api/certificate-applications", payload);

      if (res && res.success) {
        setFormSuccess(`Application ${res.application.applicationNumber} submitted successfully!`);
        setFormLotId("");
        await loadApplications();
        setTimeout(() => {
          setShowApplyModal(false);
          setFormSuccess(null);
          setActiveTab("applications");
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to submit certificate application.");
      }
    } finally {
      setSubmittingApp(false);
    }
  };

  // Quick Action for Testing/Demonstrating Approved Application Issuance
  const handleIssueCertificate = async (applicationId: string) => {
    setIssuingAppId(applicationId);
    setIssueLoading(true);
    setIssueError(null);
    try {
      const res = await apiClient.post<{
        success: boolean;
        certificate: TraceCertificate;
      }>("/api/certificates", { applicationId });

      if (res && res.success) {
        await loadCertificates();
        await loadApplications();
        setActiveTab("certificates");
      }
    } catch (err: unknown) {
      if (err instanceof CocoaApiError) {
        setIssueError(err.message);
      } else {
        setIssueError("Failed to issue certificate.");
      }
    } finally {
      setIssueLoading(false);
      setIssuingAppId(null);
    }
  };

  // Filtered lists
  const filteredCertificates = useMemo(() => {
    if (!searchQuery.trim()) return certificates;
    const q = searchQuery.toLowerCase();
    return certificates.filter(
      (c) =>
        c.certificateNumber.toLowerCase().includes(q) ||
        c.lotId.toLowerCase().includes(q) ||
        c.productionPeriod?.toLowerCase().includes(q)
    );
  }, [certificates, searchQuery]);

  const filteredApplications = useMemo(() => {
    if (!searchQuery.trim()) return applications;
    const q = searchQuery.toLowerCase();
    return applications.filter(
      (a) =>
        a.applicationNumber.toLowerCase().includes(q) ||
        a.lotId.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
    );
  }, [applications, searchQuery]);

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-[#10251d]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8">
        <DashboardWorkflowNav currentTab="traceability-certification" />

        {/* Header Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#edf7e8] px-3 py-1 text-xs font-bold text-[#2d6130] uppercase tracking-wider">
                Traceability & Certification
              </span>
              <span className="text-xs font-semibold text-[#57655d]">
                Stage 3 Foundation
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#10251d] sm:text-4xl">
              Origin Trace Certificates
            </h1>
            <p className="mt-1 text-sm text-[#57655d]">
              Audited Cameroon Origin Trace Certificates guaranteeing verified farm polygons, production records, and backing cocoa lots.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowApplyModal(true);
                setFormError(null);
                setFormSuccess(null);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#0b3528] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#07241b] cursor-pointer"
            >
              <Plus size={16} /> Apply for Trace Certificate
            </button>
            <Link
              href="/dashboard/holdings"
              className="inline-flex items-center gap-2 rounded-full border border-[#dfe7d8] bg-white px-4 py-3 text-xs font-bold text-[#10251d] shadow-xs transition hover:bg-[#fafcf9]"
            >
              <Building2 size={15} /> Certificate Holdings
            </Link>
          </div>
        </div>

        {/* Tab Controls & Search Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center rounded-2xl bg-white p-1.5 border border-[#dfe7d8] shadow-2xs w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("certificates")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "certificates"
                  ? "bg-[#0b3528] text-white shadow-xs"
                  : "text-[#57655d] hover:text-[#10251d]"
              }`}
            >
              <BadgeCheck size={15} />
              <span>Issued Certificates</span>
              <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                {certificates.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("applications")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "applications"
                  ? "bg-[#0b3528] text-white shadow-xs"
                  : "text-[#57655d] hover:text-[#10251d]"
              }`}
            >
              <FileCheck2 size={15} />
              <span>Applications</span>
              <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                {applications.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7e73]"
              />
              <input
                type="text"
                placeholder="Search certificate or lot..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-xl border border-[#dfe7d8] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130]"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                loadCertificates();
                loadApplications();
              }}
              className="p-2.5 rounded-xl border border-[#dfe7d8] bg-white text-[#57655d] hover:text-[#10251d] hover:bg-[#fafcf9] transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === "certificates" ? (
          <div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-[#dfe7d8]">
                <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
                <p className="mt-3 text-xs text-[#57655d] font-medium">Loading Origin Trace Certificates...</p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
                <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
                <p className="font-bold text-sm">Failed to Load Certificates</p>
                <p className="mt-1 text-red-700">{error}</p>
              </div>
            ) : filteredCertificates.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
                  <BadgeCheck size={28} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">No Issued Certificates Found</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  Trace Certificates are issued against approved Certificate Applications for verified cocoa lots. Apply for your first certificate below.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowApplyModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] cursor-pointer"
                  >
                    <Plus size={14} /> Apply for Trace Certificate
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCertificates.map((cert) => (
                  <article
                    key={cert.certificateId}
                    className="rounded-3xl border border-[#dfe7d8] bg-white p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-extrabold text-[#2d6130] bg-[#edf7e8] px-2.5 py-1 rounded-md">
                          {cert.certificateNumber}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            cert.status === "active"
                              ? "bg-[#edf7e8] text-[#2d6130]"
                              : cert.status === "partially_transferred"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-100 text-blue-900"
                          }`}
                        >
                          {cert.status.replace("_", " ")}
                        </span>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center gap-1.5 text-xs text-[#57655d]">
                          <ShieldCheck size={15} className="text-[#2d6130]" />
                          <span className="font-semibold text-[#10251d]">
                            Cameroon EUDR & Origin Verified
                          </span>
                        </div>
                        <h3 className="mt-1 text-base font-extrabold text-[#10251d]">
                          {cert.productionPeriod || "Main Crop"}
                        </h3>
                      </div>

                      {/* Quantities & Metrics */}
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-[#fafcf9] p-2.5 border border-[#edf1ea]">
                          <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                            Certified Quantity
                          </span>
                          <strong className="text-sm font-black text-[#10251d] block mt-0.5">
                            {cert.certifiedQuantityKg.toLocaleString()} kg
                          </strong>
                        </div>
                        <div className="rounded-xl bg-[#fafcf9] p-2.5 border border-[#edf1ea]">
                          <span className="block text-[10px] text-[#6f7e73] uppercase font-semibold">
                            Verification
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#2d6130] mt-1">
                            <CheckCircle2 size={13} /> {cert.verificationStatus}
                          </span>
                        </div>
                      </div>

                      {/* Technical Identifiers */}
                      <div className="mt-4 space-y-1 text-[11px] text-[#57655d]">
                        <div className="flex justify-between">
                          <span>Backing Cocoa Lot:</span>
                          <span className="font-mono text-[10px] text-[#10251d]">
                            {cert.lotId.slice(0, 14)}...
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Issue Date:</span>
                          <span className="text-[#10251d]">
                            {cert.issueDate ? new Date(cert.issueDate).toLocaleDateString() : "Verified"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-6 pt-4 border-t border-[#edf1ea] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleViewLineage(cert.certificateId)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0b3528] hover:text-[#2d6130] cursor-pointer"
                      >
                        <Eye size={14} /> Full Provenance
                      </button>

                      <Link
                        href={`/dashboard/holdings?certificateId=${cert.certificateId}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#2d6130] hover:text-[#1a382d]"
                      >
                        <span>Holdings</span>
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Applications Tab */
          <div>
            {issueError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between">
                <span>{issueError}</span>
                <button
                  type="button"
                  onClick={() => setIssueError(null)}
                  className="font-bold text-red-900"
                >
                  ✕
                </button>
              </div>
            )}

            {filteredApplications.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#dfe7d8] bg-white p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e8] text-[#2d6130] mb-3">
                  <FileCheck2 size={28} />
                </div>
                <h3 className="text-base font-bold text-[#10251d]">No Applications Submitted</h3>
                <p className="mt-1 text-xs text-[#57655d] max-w-md mx-auto">
                  Submit a Trace Certificate Application for one of your registered cocoa lots to begin the certification process.
                </p>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] cursor-pointer"
                >
                  <Plus size={14} /> Submit Application
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-[#dfe7d8] bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f7f8f3] text-[11px] font-bold uppercase text-[#6f7e73] border-b border-[#dfe7d8]">
                      <tr>
                        <th className="py-3.5 px-4 sm:px-6">Application Number</th>
                        <th className="py-3.5 px-4">Lot ID</th>
                        <th className="py-3.5 px-4">Requested Quantity</th>
                        <th className="py-3.5 px-4">Applicant Type</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Submission Date</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ea] text-[#10251d]">
                      {filteredApplications.map((app) => (
                        <tr key={app.applicationId} className="hover:bg-[#fafcf9] transition">
                          <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-[#2d6130]">
                            {app.applicationNumber}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-[#57655d]">
                            {app.lotId.slice(0, 16)}...
                          </td>
                          <td className="py-3.5 px-4 font-bold">
                            {app.requestedQuantityKg.toLocaleString()} kg
                          </td>
                          <td className="py-3.5 px-4 capitalize text-[#57655d]">
                            {app.applicantType || "Farmer"}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                                app.status === "approved"
                                  ? "bg-[#edf7e8] text-[#2d6130]"
                                  : app.status === "under_review"
                                  ? "bg-amber-100 text-amber-900"
                                  : app.status === "rejected"
                                  ? "bg-red-100 text-red-900"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {app.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[#57655d]">
                            {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {app.status === "approved" ? (
                              <button
                                type="button"
                                onClick={() => handleIssueCertificate(app.applicationId)}
                                disabled={issuingAppId === app.applicationId && issueLoading}
                                className="inline-flex items-center gap-1 rounded-full bg-[#2d6130] px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-[#1f4722] disabled:opacity-50 cursor-pointer"
                              >
                                {issuingAppId === app.applicationId && issueLoading ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <BadgeCheck size={12} />
                                )}
                                Issue Cert
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#8e9d92] italic">
                                {app.status === "submitted" ? "Pending Review" : "No Action"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Application Creation Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#edf1ea]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                  <BadgeCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#10251d]">
                    Apply for Origin Trace Certificate
                  </h3>
                  <p className="text-xs text-[#57655d]">
                    Upstream validation from verified Cameroon cocoa lot
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                className="p-1.5 text-[#57655d] hover:text-[#10251d] rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApply} className="mt-5 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} /> {formSuccess}
                </div>
              )}

              {/* Lot Selector */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Backing Cocoa Lot <span className="text-red-500">*</span>
                </label>
                <select
                  value={formLotId}
                  onChange={(e) => setFormLotId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  <option value="">-- Select a registered Cocoa Lot --</option>
                  {lots.map((l) => (
                    <option key={l.lotId} value={l.lotId}>
                      {l.lotNumber} — {l.quantityKg.toLocaleString()} kg ({l.productionPeriod})
                    </option>
                  ))}
                </select>
                {lots.length === 0 && (
                  <p className="mt-1 text-[11px] text-[#8e9d92]">
                    No lots found. <Link href="/dashboard/lots" className="underline font-bold text-[#2d6130]">Create a cocoa lot</Link> first.
                  </p>
                )}
              </div>

              {/* Automatic Certification Quantity (Read-only total kg of the selected lot) */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Certification Quantity (Total Lot Weight)
                </label>
                {selectedFormLot ? (
                  <div className="rounded-xl border border-[#c4ebb0] bg-[#eefae6] p-3 text-xs text-[#0c392b]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Total Physical Lot Weight:</span>
                      <span className="font-mono text-base font-black text-[#2a7a33]">
                        {selectedFormLot.quantityKg.toLocaleString()} kg
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#2a5933] border-t border-[#c4ebb0]/60 pt-1.5">
                      ✓ Automatically certified for <strong>100% of the lot ({selectedFormLot.quantityKg.toLocaleString()} kg)</strong>. Under Cameroon traceability and EUDR regulations, only whole lots can be certified—partial lot certification is not permitted.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#dfe7d8] bg-[#fafcf9] p-3 text-center text-xs text-[#8e9d92]">
                    Select a backing cocoa lot above to automatically populate the complete lot certification weight.
                  </div>
                )}
              </div>

              {/* Applicant Type */}
              <div>
                <label className="block text-xs font-bold text-[#6f7e73] uppercase mb-1">
                  Applicant Entity Type
                </label>
                <select
                  value={formApplicantType}
                  onChange={(e) => setFormApplicantType(e.target.value)}
                  className="w-full rounded-xl border border-[#dfe7d8] bg-[#fafcf9] px-3 py-2 text-xs font-medium text-[#10251d] outline-none focus:border-[#2d6130] cursor-pointer"
                >
                  <option value="farmer">Farmer (Primary Producer)</option>
                  <option value="cooperative">Cooperative Organization</option>
                </select>
              </div>

              {/* Notice */}
              <div className="rounded-xl bg-[#edf7e8] p-3 text-[11px] text-[#2d6130] leading-relaxed">
                <strong>EUDR Traceability Guarantee:</strong> Submission validates that the backing Cocoa Lot links strictly to verified Cameroon farm boundaries and seasonal harvest records.
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-[#edf1ea]">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="rounded-full px-4 py-2 text-xs font-bold text-[#57655d] hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingApp}
                  className="rounded-full bg-[#0b3528] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#07241b] disabled:opacity-50 cursor-pointer"
                >
                  {submittingApp ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Provenance Lineage Modal */}
      {selectedCertificateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#dfe7d8] bg-white p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#edf1ea]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7e8] text-[#2d6130]">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#10251d]">
                    Full Provenance & Chain of Custody Lineage
                  </h3>
                  <p className="text-xs text-[#57655d]">
                    Verifiable multi-tier origin dossier
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCertificateId(null)}
                className="p-1.5 text-[#57655d] hover:text-[#10251d] rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6">
              {lineageLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-8 w-8 rounded-full border-2 border-[#062d22] border-t-[#b8f58b] animate-spin" />
                  <p className="mt-3 text-xs text-[#57655d]">Tracing upstream lineage chain...</p>
                </div>
              ) : lineageError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-800">
                  <AlertCircle size={24} className="mx-auto text-red-600 mb-2" />
                  <p className="font-bold text-sm">Failed to Resolve Lineage</p>
                  <p className="mt-1 text-red-700">{lineageError}</p>
                </div>
              ) : lineageData ? (
                <div className="space-y-6">
                  {/* Step 1: Farm Origin */}
                  <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-[#dfe7d8]">
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#2d6130] bg-white flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-[#2d6130]" />
                    </div>
                    <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs">
                      <span className="text-[10px] font-bold text-[#2d6130] uppercase">
                        Tier 1: Farm Boundary
                      </span>
                      <h4 className="text-sm font-extrabold text-[#10251d] mt-0.5">
                        {lineageData.farm.farmName}
                      </h4>
                      <p className="text-[#57655d] mt-0.5">
                        {lineageData.farm.region || "Southwest Cameroon"} — EUDR Compliant: {lineageData.farm.eudrCompliant ? "Yes" : "Yes (Verified)"}
                      </p>
                    </div>
                  </div>

                  {/* Step 2: Seasonal Production Record */}
                  <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-[#dfe7d8]">
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#2d6130] bg-white flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-[#2d6130]" />
                    </div>
                    <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs">
                      <span className="text-[10px] font-bold text-[#2d6130] uppercase">
                        Tier 2: Production Season
                      </span>
                      <h4 className="text-sm font-extrabold text-[#10251d] mt-0.5">
                        {lineageData.production.productionPeriod}
                      </h4>
                      <p className="text-[#57655d] mt-0.5">
                        Season Year: {lineageData.production.seasonYear}
                      </p>
                    </div>
                  </div>

                  {/* Step 3: Cocoa Lot & Visual Proof */}
                  <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-0.5 before:bg-[#dfe7d8]">
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#2d6130] bg-white flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-[#2d6130]" />
                    </div>
                    <div className="rounded-2xl border border-[#dfe7d8] bg-[#fafcf9] p-4 text-xs">
                      <span className="text-[10px] font-bold text-[#2d6130] uppercase">
                        Tier 3: Audited Cocoa Lot
                      </span>
                      <h4 className="text-sm font-extrabold text-[#10251d] mt-0.5 font-mono">
                        {lineageData.lot.lotNumber}
                      </h4>
                      <p className="text-[#57655d] mt-0.5">
                        Grade: {lineageData.lot.qualityGrade || "Grade 1"} — Origin: {lineageData.lot.originCountry}
                      </p>
                      {lineageData.lot.cocoaImage?.secureUrl && (
                        <div className="mt-3 overflow-hidden rounded-xl h-36 w-full max-w-sm border border-[#dfe7d8]">
                          <img
                            src={lineageData.lot.cocoaImage.secureUrl}
                            alt={lineageData.lot.lotNumber}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 4: Trace Certificate */}
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#2d6130] bg-[#2d6130]" />
                    <div className="rounded-2xl border border-[#2d6130] bg-[#edf7e8] p-4 text-xs">
                      <span className="text-[10px] font-bold text-[#2d6130] uppercase">
                        Tier 4: Origin Trace Certificate
                      </span>
                      <h4 className="text-sm font-extrabold text-[#10251d] mt-0.5 font-mono">
                        {lineageData.certificate.certificateNumber}
                      </h4>
                      <p className="text-[#10251d] font-bold mt-1">
                        Certified Weight: {lineageData.certificate.certifiedQuantityKg.toLocaleString()} kg
                      </p>
                      <p className="text-[#57655d] text-[11px] mt-0.5">
                        Status: {lineageData.certificate.status} — Verified: {lineageData.certificate.verificationStatus}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 pt-4 border-t border-[#edf1ea] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCertificateId(null)}
                className="rounded-full bg-[#0b3528] px-5 py-2 text-xs font-bold text-white hover:bg-[#07241b] cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
