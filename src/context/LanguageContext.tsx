/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Language = "en" | "fr";

// Core UI translation dictionary
export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navbar
    "nav.home": "Home",
    "nav.marketplace": "Marketplace",
    "nav.dashboard": "Dashboard",
    "nav.warehouse": "Warehouse Workspace",
    "nav.agent": "Agent Workspace",
    "nav.cooperative": "Cooperative Workspace",
    "nav.farmers": "For Farmers",
    "nav.traceability": "Traceability",
    "nav.portal": "Portal",
    "nav.login": "Login",
    "nav.logout": "Log out",
    "nav.register_farm": "Register Your Farm",
    "nav.farmer_workspace": "Farmer Workspace",
    "nav.tagline": "TraceTradeNetwork - From Farm to World",

    // Roles
    "role.warehouse": "Warehouse",
    "role.agent": "Agent",
    "role.cooperative": "Cooperative",
    "role.farmer": "Farmer",
    "role.buyer": "Buyer",

    // Landing Hero
    "hero.headline": "SLITE Trace Platform connects Cameroon's cocoa to the world.",
    "hero.tagline": "Trusted by Farmers. Powered by Technology.",
    "hero.join": "Join the Movement",
    "hero.traceable_stat": "Traceable from farm to export",
    "hero.registered_farmers": "Registered Farmers",
    "hero.active_buyers": "Active Buyers",
    "hero.logistics_partners": "Logistics Partners",

    // Landing Features & Sections
    "features.title": "Built for the cocoa supply chain",
    "features.eudr": "EUDR Compliance & Geolocation",
    "features.certificates": "Traceability Certificates",
    "features.marketplace": "Secure Marketplace",
    "features.logistics": "Logistics & Storage",
    "features.payments": "MTN MoMo & Mobile Settlement",

    // Footer
    "footer.desc": "Digital traceability infrastructure for preserving cocoa provenance, ownership and supply-chain visibility, engineered by SLITE Solutions.",
    "footer.platform": "Platform",
    "footer.company": "Company",
    "footer.features": "Features",
    "footer.farmers": "For Farmers",
    "footer.buyers": "For Buyers",
    "footer.marketplace": "Marketplace",
    "footer.logistics": "Logistics",
    "footer.about": "About",
    "footer.contact": "Contact",
    "footer.privacy": "Privacy",
    "footer.terms": "Terms",
    "footer.rights": "All rights reserved.",

    // Common Actions
    "action.search": "Search",
    "action.filter": "Filter",
    "action.submit": "Submit",
    "action.cancel": "Cancel",
    "action.confirm": "Confirm",
    "action.save": "Save Changes",
    "action.view": "View",
    "action.download": "Download",
    "action.back": "Back",
  },
  fr: {
    // Navbar
    "nav.home": "Accueil",
    "nav.marketplace": "Marché",
    "nav.dashboard": "Tableau de Bord",
    "nav.warehouse": "Espace Entrepôt",
    "nav.agent": "Espace Acheteur Agréé",
    "nav.cooperative": "Espace Coopérative",
    "nav.farmers": "Pour les Planteurs",
    "nav.traceability": "Traçabilité",
    "nav.portal": "Portail",
    "nav.login": "Connexion",
    "nav.logout": "Déconnexion",
    "nav.register_farm": "Enregistrer Votre Exploitation",
    "nav.farmer_workspace": "Espace Planteur",
    "nav.tagline": "TraceTradeNetwork - De la Ferme au Monde",

    // Roles
    "role.warehouse": "Entrepôt",
    "role.agent": "Acheteur Agréé",
    "role.cooperative": "Coopérative",
    "role.farmer": "Planteur",
    "role.buyer": "Acheteur",

    // Landing Hero
    "hero.headline": "La plateforme SLITE Trace connecte le cacao du Cameroun au monde entier.",
    "hero.tagline": "Approuvé par les planteurs. Propulsé par la technologie.",
    "hero.join": "Rejoindre le Mouvement",
    "hero.traceable_stat": "Traçable de la plantation à l'exportation",
    "hero.registered_farmers": "Planteurs Enregistrés",
    "hero.active_buyers": "Acheteurs Actifs",
    "hero.logistics_partners": "Partenaires Logistiques",

    // Landing Features & Sections
    "features.title": "Conçu pour la chaîne d'approvisionnement du cacao",
    "features.eudr": "Conformité RDUE & Géolocalisation",
    "features.certificates": "Certificats de Traçabilité",
    "features.marketplace": "Marché Sécurisé",
    "features.logistics": "Logistique & Stockage",
    "features.payments": "Paiements MTN MoMo & Règlement Mobile",

    // Footer
    "footer.desc": "Infrastructure numérique de traçabilité pour préserver la provenance, la propriété et la visibilité de la filière cacao, développée par SLITE Solutions.",
    "footer.platform": "Plateforme",
    "footer.company": "Entreprise",
    "footer.features": "Fonctionnalités",
    "footer.farmers": "Pour les Planteurs",
    "footer.buyers": "Pour les Acheteurs",
    "footer.marketplace": "Marché",
    "footer.logistics": "Logistique",
    "footer.about": "À propos",
    "footer.contact": "Contact",
    "footer.privacy": "Confidentialité",
    "footer.terms": "Conditions",
    "footer.rights": "Tous droits réservés.",

    // Common Actions
    "action.search": "Rechercher",
    "action.filter": "Filtrer",
    "action.submit": "Soumettre",
    "action.cancel": "Annuler",
    "action.confirm": "Confirmer",
    "action.save": "Enregistrer",
    "action.view": "Afficher",
    "action.download": "Télécharger",
    "action.back": "Retour",
  },
};

// Word & phrase translation map for automatic DOM text enhancement when French is active
const phrasePairs: [string, string][] = [
  // Brand & Nav
  ["TraceTradeNetwork - From Farm to World", "TraceTradeNetwork - De la Ferme au Monde"],
  ["From Farm to World", "De la Ferme au Monde"],
  ["Marketplace", "Marché"],
  ["Traceability", "Traçabilité"],
  ["Warehouse Workspace", "Espace Entrepôt"],
  ["Agent Workspace", "Espace Acheteur Agréé"],
  ["Cooperative Workspace", "Espace Coopérative"],
  ["Farmer Workspace", "Espace Planteur"],
  ["For Farmers", "Pour les Planteurs"],
  ["Register Your Farm", "Enregistrer Votre Exploitation"],
  ["Login to Account", "Connexion au compte"],
  ["Login", "Connexion"],
  ["Log out", "Déconnexion"],
  ["Portal", "Portail"],
  ["Home", "Accueil"],

  // Landing Page Headlines & Sections
  ["TraceTradeNetwork connects Cameroon's cocoa to the world.", "La plateforme connecte le cacao du Cameroun au monde entier."],
  ["SLITE Trace Platform connects Cameroon's cocoa to the world.", "La plateforme SLITE Trace connecte le cacao du Cameroun au monde entier."],
  ["Trusted by Farmers. Powered by Technology.", "Approuvé par les planteurs. Propulsé par la technologie."],
  ["Join the Movement", "Rejoindre le mouvement"],
  ["Traceable from farm to export", "Traçable de la plantation à l'exportation"],
  ["Registered Farmers", "Planteurs enregistrés"],
  ["Active Buyers", "Acheteurs actifs"],
  ["Logistics Partners", "Partenaires logistiques"],
  ["Built for the cocoa supply chain", "Conçu pour la chaîne d'approvisionnement du cacao"],
  ["Farm Registration & Geofencing", "Enregistrement des plantations & Géolocalisation"],
  ["Farmers register and map their farms with accurate geolocation data.", "Les planteurs cartographient leurs parcelles avec des coordonnées GPS certifiées."],
  ["Traceability Certificates", "Certificats de traçabilité"],
  ["Apply for traceability certificates to ensure a verified cocoa supply chain.", "Délivrance de certificats assurant une traçabilité vérifiée du cacao."],
  ["Secure Marketplace", "Place de marché sécurisée"],
  ["Buyers and sellers trade with confidence, with full traceability records.", "Acheteurs et vendeurs négocient en toute confiance avec l'historique complet des lots."],
  ["MTN MoMo & Remittance Integration", "Intégration MTN MoMo & Règlements"],
  ["Seemless payments for cross-border and local transactions.", "Paiements fluides pour les transactions locales et transfrontalières."],
  ["Logistics & Storage", "Logistique & Entreposage"],
  ["Track transportation and storage with our cross-border logistics network.", "Suivi du transport et du stockage au sein de notre corridor logistique."],

  // Common UI labels
  ["Digital traceability infrastructure for preserving cocoa provenance, ownership and supply-chain visibility, engineered by SLITE Solutions.", "Infrastructure numérique de traçabilité préservant la provenance, la propriété et la transparence de la filière cacao, développée par SLITE Solutions."],
  ["All rights reserved.", "Tous droits réservés."],
  ["Search", "Rechercher"],
  ["Filter", "Filtrer"],
  ["Submit", "Soumettre"],
  ["Cancel", "Annuler"],
  ["Confirm", "Confirmer"],
  ["Back", "Retour"],
  ["Download Certificate", "Télécharger le certificat"],
  ["EUDR Compliant", "Conforme RDUE"],
  ["EUDR Compliance", "Conformité RDUE"],
  ["Cross River", "Cross River"],
  ["Cameroon", "Cameroun"],
  ["Warehouse", "Entrepôt"],
  ["Cooperative", "Coopérative"],
  ["Agent", "Acheteur Agréé"],
  ["Farmer", "Planteur"],
  ["Buyer", "Acheteur"],
  ["Exporter", "Exportateur"],
  ["Inventory", "Inventaire"],
  ["Inspection", "Inspection"],

  // Dashboards & Workspaces
  ["Dashboard", "Tableau de Bord"],
  ["Analytics", "Analytique"],
  ["Certificates", "Certificats"],
  ["Holdings", "Lots Détenus"],
  ["Transfers", "Transferts"],
  ["Trades", "Transactions"],
  ["QR Scanner", "Scanner QR"],
  ["Profile", "Profil"],
  ["Settings", "Paramètres"],
  ["Total Volume", "Volume Total"],
  ["Active Lots", "Lots Actifs"],
  ["Certified Yield", "Rendement Certifié"],
  ["Pending Approvals", "En attente d'approbation"],
  ["Storage Capacity", "Capacité de Stockage"],
  ["Occupancy", "Taux d'Occupation"],
  ["Intake Management", "Gestion des Entrées"],
  ["Quality Grading", "Notation Qualité"],
  ["Moisture Content", "Teneur en Humidité"],
  ["Bean Count", "Nombre de Fèves (par 100g)"],
  ["Defects", "Défauts"],
  ["Storage Facility", "Installation de Stockage"],
  ["GPS Latitude", "Latitude GPS"],
  ["GPS Longitude", "Longitude GPS"],
  ["Facility Name", "Nom de l'Installation"],
  ["Storage Location", "Emplacement de Stockage"],
  ["Capacity (Tons)", "Capacité (Tonnes)"],
  ["Save Changes", "Enregistrer les modifications"],
  ["Create Trade Listing", "Créer une Offre de Vente"],
  ["Negotiate Price", "Négocier le Prix"],
  ["Escrow Status", "Statut du Séquestre"],
  ["Payment Released", "Paiement Libéré"],
  ["View Details", "Afficher les Détails"],
  ["Generate QR Code", "Générer le Code QR"],
  ["Verify Provenance", "Vérifier la Provenance"],
  ["EUDR Risk Assessment", "Évaluation des Risques RDUE"],
  ["Deforestation Free", "Sans Déforestation"],
  ["Polygon Mapping", "Cartographie Polygone"],
  ["Farmer Registration", "Enregistrement de Planteur"],
  ["Cooperative Onboarding", "Adhésion Coopérative"],
  ["Licensed Buying Agent", "Acheteur Agréé"],
  ["Export Permit", "Permis d'Exportation"],
  ["Log out", "Déconnexion"],

  // Comprehensive Platform UI Phrases
  ["Who are you in the supply chain?", "Quel est votre rôle dans la chaîne d'approvisionnement ?"],
  ["Select your role to access tailored dashboards, workflows, certificate management, and traceability tools designed for your stakeholder type.", "Sélectionnez votre rôle pour accéder aux tableaux de bord, flux de travail, gestion de certificats et outils de traçabilité adaptés."],
  ["Continue", "Continuer"],
  ["Sign In", "Se connecter"],
  ["Password", "Mot de passe"],
  ["Email Address", "Adresse e-mail"],
  ["Register", "S'inscrire"],
  ["Full Name", "Nom Complet"],
  ["Phone Number", "Numéro de Téléphone"],
  ["Location", "Emplacement"],
  ["Region", "Région"],
  ["State", "État / Province"],
  ["Country", "Pays"],
  ["Submit Application", "Soumettre la demande"],
  ["Pending Verification", "Vérification en attente"],
  ["Approved", "Approuvé"],
  ["Rejected", "Rejeté"],
  ["In Transit", "En transit"],
  ["Delivered", "Livré"],
  ["Available Balance", "Solde Disponible"],
  ["Escrow Account", "Compte Séquestre"],
  ["Transfer History", "Historique des Transferts"],
  ["Initiate Transfer", "Initier un Transfert"],
  ["Receiver ID", "ID du Destinataire"],
  ["Lot Number", "Numéro de Lot"],
  ["Weight (Kg)", "Poids (Kg)"],
  ["Harvest Date", "Date de Récolte"],
  ["Processing Center", "Centre de Traitement"],
  ["Export Hub", "Hub d'Exportation"],
  ["Port of Exit", "Port de Sortie"],
  ["Customs Clearance", "Dédouanement"],
  ["Compliance Status", "Statut de Conformité"],
  ["Audit Trail", "Piste d'Audit"],
  ["Scan QR Code", "Scanner le Code QR"],
  ["Scan Successful", "Scan Réussi"],
  ["Provenance Verified", "Provenance Vérifiée"],
  ["Origin Country", "Pays d'Origine"],
  ["Producer Name", "Nom du Producteur"],
  ["Cooperative Name", "Nom de la Coopérative"],
  ["Storage Conditions", "Conditions de Stockage"],
  ["Temperature", "Température"],
  ["Humidity", "Humidité"],
  ["Inspection Date", "Date d'Inspection"],
  ["Inspector Notes", "Notes de l'Inspecteur"],
  ["Issue Certificate", "Délivrer le Certificat"],
  ["Certificate ID", "ID du Certificat"],
  ["Valid Until", "Valide Jusqu'au"],
  ["Revoke", "Révoquer"],
  ["Print", "Imprimer"],
  ["Share", "Partager"],
  ["Export Report", "Exporter le Rapport"],
  ["View All", "Tout Afficher"],
  ["Recent Activity", "Activité Récente"],
  ["Quick Actions", "Actions Rapides"],
  ["System Status", "État du Système"],
  ["Secure Gateway", "Passerelle Sécurisée"],

  // Additional Marketplace, Farming & Warehouse UI Strings
  ["Cocoa Marketplace", "Marché du Cacao"],
  ["Commercial Cocoa Trades", "Transactions Commerciales de Cacao"],
  ["Cocoa Lots", "Lots de Cacao"],
  ["Create Cocoa Listing", "Créer une Offre de Cacao"],
  ["Buy Cocoa", "Acheter du Cacao"],
  ["Price per Ton", "Prix par Tonne (FCFA / USD)"],
  ["Quantity (Tons)", "Quantité (Tonnes)"],
  ["Listing Status", "Statut de l'Offre"],
  ["Active Listings", "Offres Actives"],
  ["Negotiations", "Négociations"],
  ["Make Offer", "Faire une Offre"],
  ["Accept Offer", "Accepter l'Offre"],
  ["Decline Offer", "Refuser l'Offre"],
  ["Trade Complete", "Transaction Terminée"],
  ["Payment Escrow", "Séquestre de Paiement"],
  ["Release Funds", "Libérer les Fonds"],
  ["Dispute Resolution", "Résolution des Litiges"],
  ["Certificate Holdings", "Certificats Détenus"],
  ["Apply for Origin Trace Certificate", "Demander un Certificat d'Origine et de Traçabilité"],
  ["Certificate Verification", "Vérification des Certificats"],
  ["Batch Notes", "Notes de Lot"],
  ["Cocoa Variety", "Variété de Cacao"],
  ["Forstalis Compliance", "Conformité Forestière"],
  ["Deforestation-Free Verified", "Vérifié Sans Déforestation"],
  ["Geofence Coordinates", "Coordonnées de Géorepérage"],
  ["Plot Area (Hectares)", "Superficie de la Parcelle (Hectares)"],
  ["Estimated Annual Yield", "Rendement Annuel Estimé"],
  ["Farmer Registration", "Enregistrement du Planteur"],
  ["Cooperative Onboarding", "Adhésion de Coopérative"],
  ["Licensed Buying Agent Workspace", "Espace Acheteur Agréé"],
  ["Warehouse Intake Gate", "Porte d'Entrée Entrepôt"],
  ["Gate Inspection", "Inspection au Portail"],
  ["Intake Approved", "Entrée Approuvée"],
  ["Intake Rejected", "Entrée Rejetée"],
  ["Storage Bay Assignment", "Attribution de la Baie de Stockage"],
  ["Stock Ledger", "Registre des Stocks"],
  ["Export Dispatch", "Expédition à l'Exportation"],
  ["Shipping Manifest", "Manifeste d'Expédition"],
  ["Bill of Lading", "Connaissement"],
  ["Customs Bonded Code", "Code Douanier en Entrepôt Sous Douane"],
];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key, fallback) => fallback || key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("preferred_language") as Language | null;
    if (saved === "fr" || saved === "en") {
      setLanguageState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("preferred_language", lang);
      document.documentElement.lang = lang;
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const langDict = translations[language];
      if (langDict && langDict[key]) {
        return langDict[key];
      }
      return fallback || translations["en"][key] || key;
    },
    [language]
  );

  // Automatic DOM text translation enhancement when French is active
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    if (language === "fr") {
      const applyFrenchTranslations = () => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName.toLowerCase();
              if (tag === "script" || tag === "style" || tag === "input" || tag === "textarea") {
                return NodeFilter.FILTER_REJECT;
              }
              // Do not translate the SLITE brand wordmark
              if (parent.closest("[data-no-translate]") || parent.classList.contains("word-sli")) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          }
        );

        let node = walker.nextNode();
        while (node) {
          const original = node.nodeValue || "";
          for (const [en, fr] of phrasePairs) {
            if (original.includes(en)) {
              node.nodeValue = original.replaceAll(en, fr);
            }
          }
          node = walker.nextNode();
        }
      };

      // Run initially and observe mutations for dynamically rendered content
      applyFrenchTranslations();
      const observer = new MutationObserver(() => {
        applyFrenchTranslations();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      return () => observer.disconnect();
    } else {
      // Revert when switching back to English
      const applyEnglishReversion = () => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName.toLowerCase();
              if (tag === "script" || tag === "style" || tag === "input" || tag === "textarea") {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          }
        );

        let node = walker.nextNode();
        while (node) {
          const current = node.nodeValue || "";
          for (const [en, fr] of phrasePairs) {
            if (current.includes(fr)) {
              node.nodeValue = current.replaceAll(fr, en);
            }
          }
          node = walker.nextNode();
        }
      };

      applyEnglishReversion();
    }
  }, [language, mounted]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
