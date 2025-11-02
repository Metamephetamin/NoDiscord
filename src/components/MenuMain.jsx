import '../css/MenuMain.css';

const MenuMain = () => {
  return (
      <div className="menu__main">
          <div className='box1'>
            <img src='../../image/image.png'></img>
          </div>
          <div className='box2'>
              <div className='text__channel'>
                  <h1>Channels</h1>
                  <span>Text channel</span>
                  <nav>
                      <ul>
                          <li># General</li>
                          <li># Чатек для псыжков</li>
                      </ul>
                 </nav>
              </div>

               <div className='voice__channel'>
                  <span>Voice channel</span>
                   <nav>
                      <ul>
                          <li># General</li>
                          <li>#Воис для псыжков</li>
                      </ul>
                 </nav>
              </div>
             
          </div>
          <div className='box3'>
              <div className='boxwr'></div>
              <div className='boxwr'></div>
          </div>
      </div>
      
  );
}

export default MenuMain;





/* <img src="../../icons/translations.png" />
            <img src="../../icons/microphone.png" />
            <img src="../../icons/headphones.png" />
            <img src="../../icons/settings.png" /> */