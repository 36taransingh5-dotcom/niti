import { PolicySpec } from "../schema/spec";
import { scholarship2025 } from "./scholarship2025";

/**
 * Compiled specification for the National Merit Support Scholarship,
 * 2026 revision. Demonstration policy — synthetic / fictional.
 *
 * Meaningful changes from 2025:
 *  - Minimum age raised from 18 to 21 (§2.1)
 *  - Diploma programmes now eligible (§2.3)
 *  - Income threshold raised from ₹3,00,000 to ₹3,50,000 (§3.2)
 *  - NEW: income exemption for students with certified disabilities (§3.4)
 *  - NEW: disability certificate document requirement (§4)
 */
export const scholarship2026: PolicySpec = {
  ...scholarship2025,
  versionLabel: "2026",
  description:
    "Financial assistance for students from lower-income households enrolled in accredited higher-education institutions. 2026 revision. Demonstration policy — synthetic / fictional.",
  sections: [
    ...scholarship2025.sections.filter((s) => s.id !== "5"),
    { id: "3.4", title: "Disability Exemption" },
    { id: "5", title: "Processing" },
  ],
  fields: [
    ...scholarship2025.fields.map((f) =>
      f.key === "courseLevel"
        ? { ...f }
        : f,
    ),
    {
      key: "doc_disability",
      label: "Disability certificate",
      type: "boolean" as const,
      step: "documents",
      required: true,
      visibleWhen: {
        type: "condition",
        id: "vis-disability-doc",
        field: "hasDisabilityCertificate",
        operator: "==",
        value: true,
        label: "Applicant holds a disability certificate",
        sourceQuote:
          "Applicants claiming the exemption under §3.4 shall submit a disability certificate issued by the competent medical authority.",
        sourceSection: "4",
        confidence: 0.92,
        status: "pending",
      },
    },
  ],
  eligibility: {
    type: "group",
    id: "grp-root",
    operator: "AND",
    label: "All eligibility requirements",
    children: [
      {
        type: "condition",
        id: "cond-age",
        field: "age",
        operator: ">=",
        value: 21,
        label: "Minimum age requirement",
        sourceQuote:
          "Applicants must have attained the age of 21 years on or before the date of application.",
        sourceSection: "2.1",
        confidence: 0.98,
        status: "pending",
      },
      {
        type: "condition",
        id: "cond-enrolled",
        field: "enrolled",
        operator: "==",
        value: true,
        label: "Enrolment in accredited institution",
        sourceQuote:
          "The applicant shall be enrolled, at the time of application, in an institution accredited by the competent authority.",
        sourceSection: "2.2",
        confidence: 0.97,
        status: "pending",
      },
      {
        type: "condition",
        id: "cond-course",
        field: "courseLevel",
        operator: "IN",
        value: ["undergraduate", "postgraduate", "diploma"],
        label: "Eligible course of study",
        sourceQuote:
          "The scholarship is available to students pursuing full-time undergraduate or postgraduate degree programmes, or recognised diploma programmes of not less than one year's duration.",
        sourceSection: "2.3",
        confidence: 0.91,
        status: "pending",
      },
      {
        type: "group",
        id: "grp-income-exception",
        operator: "OR",
        label: "Household income threshold (with disability exemption)",
        children: [
          {
            type: "condition",
            id: "cond-income",
            field: "annualHouseholdIncome",
            operator: "<",
            value: 350000,
            label: "Household income threshold",
            sourceQuote:
              "Applicants with an annual household income not exceeding ₹3,50,000 (Rupees three lakh fifty thousand) shall be eligible for assistance under this scheme.",
            sourceSection: "3.2",
            confidence: 0.96,
            status: "pending",
          },
          {
            type: "condition",
            id: "cond-disability-exemption",
            field: "hasDisabilityCertificate",
            operator: "==",
            value: true,
            label: "Disability income exemption",
            sourceQuote:
              "Students holding a disability certificate issued by the competent medical authority shall be exempt from the household income ceiling prescribed in §3.2.",
            sourceSection: "3.4",
            confidence: 0.89,
            status: "pending",
          },
        ],
      },
    ],
  },
  exceptions: [
    {
      id: "exc-disability-income",
      label: "Disability income exemption",
      description:
        "IF the applicant holds a certified disability certificate THEN the household income threshold does not apply.",
      appliesToNodeId: "grp-income-exception",
      sourceQuote:
        "Students holding a disability certificate issued by the competent medical authority shall be exempt from the household income ceiling prescribed in §3.2.",
      sourceSection: "3.4",
      confidence: 0.89,
      status: "pending",
    },
  ],
  documents: [
    ...scholarship2025.documents,
    {
      id: "disability",
      label: "Disability certificate",
      description: "Issued by the competent medical authority. Required only when claiming the §3.4 exemption.",
      requiredWhen: {
        type: "condition",
        id: "req-disability-doc",
        field: "hasDisabilityCertificate",
        operator: "==",
        value: true,
        label: "Applicant holds a disability certificate",
        sourceQuote:
          "Applicants claiming the exemption under §3.4 shall submit a disability certificate issued by the competent medical authority.",
        sourceSection: "4",
        confidence: 0.92,
        status: "pending",
      },
      requiresManualReview: true,
      sourceQuote:
        "Applicants claiming the exemption under §3.4 shall submit a disability certificate issued by the competent medical authority, which shall be verified during processing.",
      sourceSection: "4",
      confidence: 0.92,
      status: "pending",
    },
  ],
};
