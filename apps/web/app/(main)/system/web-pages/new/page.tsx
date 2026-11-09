import { requireWebAdmin } from "../requireWebAdmin";
import WebPageForm from "../WebPageForm";
export default async function Page(){await requireWebAdmin();return <WebPageForm/>;}
