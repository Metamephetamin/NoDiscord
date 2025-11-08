import '../css/MenuMain.css';
import '../css/MenuProfile.css'

const MenuMain = () => {
  return (
      <div className="menu__main">
          <div className='box1'>
              <img className='btn__server' src='../../image/image.png'></img>
            <img className='btn__create-serever'  src='../../icons/plus.png'></img>
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
              <div className='wrapper__menu-profile'>
                  <div className='menu__profile'>
                      <div className='btn__management'>
                          <div className='grid__box-management'>
                              <img className='wifi' src='../../icons/wifi.png'></img>
                          </div>
                          <div className='grid__box-management'>
                              <video className='video' autoplay='true' loop muted  playsinline webkit-playsinline x5-playsinline src='../../image/sky-anime.mp4'></video>
                              <div className='grid__box-management'></div>
                          </div>
                          <div className='grid__box-speacker'>
                              <img className='phone' src='../../icons/phone.png'></img>
                              <img className='volume' src='../../icons/volumespeacker.png'></img>
                          </div>
                          {/* <div className='grid__box-management'>4</div> */}
                      </div>
                      <div className='main__profile'>
                          <div className='wrapper__box-row'>
                              <div className='box__row-profile'>
                                  <img src='../../image/avatar.jpg'></img>
                              </div>
                              <div className='wrapper__name-box'>
                                  <div className='box__row-profile'>
                                      <span>Псыжок</span>
                                    </div>
                                  <div className='box__row-profile'>
                                      <span id='status__profile'>Статус Invisability</span>
                                  </div>
                              </div>
                          </div>
                          
                          <div className='box__row-profile'></div>
                          
                          <div className='box__row-profile'>
                              <img src='../../icons/translations.png'></img>
                              <div className='box__row-profile'>
                                  <img className='microphone' src='../../icons/microphone.png'></img>
                              </div>
                              <div className='box__row-profile'>
                                  <img className='headphones' src='../../icons/headphones.png'></img>
                              </div>
                          </div>
                      </div>
                   </div>
              </div>
            
          </div>
          <div className='box3'>
              <div className='boxwr'>
                  <h1>Надпись на футболке п3,14зда</h1>
              </div>
              <div className='wrapper__chat'>
              <img className='btn__plus' width="30px"  src='../../icons/plus.png'></img>
                  <textarea placeholder='Введите сюда SQL-инъекцию, пж...' className='input__chat'></textarea>
              </div>
                  
          </div>
      </div>
      
  );
}

export default MenuMain;
