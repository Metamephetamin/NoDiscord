import { createRoot } from 'react-dom/client';
import MenuMain from './components/MenuMain';
import './css/MenuMain.css';




const App = () => {
  return  <>
    <MenuMain />
  </>
           
  
}

const container = document.getElementById("root");
const root = createRoot(container);

root.render(<App />);